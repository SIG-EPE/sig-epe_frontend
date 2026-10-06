"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUploadExtraRequestDocument } from "@/hooks/use-requests";
import { useRequestDocumentUploadQueue } from "@/hooks/use-request-document-upload-queue";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { ROLE_CODE } from "@/lib/constants";
import { getExtraDocumentMutationContext } from "@/lib/request-extra-document-context";
import { invalidateRequestDomain } from "@/lib/query-tags";
import { REQUEST_DOCUMENT_UPLOAD_FILE_STATE } from "@/lib/request-document-upload-queue";
import { deleteExtraRequestDocument, getApiErrorMessage, getOtherDocumentBusinessMetadata, getRequestDocumentAccept, getRequestDocumentAcceptedFormatsLabel, getRequestDocumentDisplayName, isRetryableRequestDocumentUploadError, REQUEST_DOCUMENT_CATEGORY_OPTIONS, validateOtherDocumentDisplayName } from "@/lib/requests";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_DOCUMENT_CATEGORY, type ExtraRequestDocumentMutationContext, type PaymentRequest, type RequestDocument, type RequestDocumentCategory, type UploadRequestDocumentInput } from "@/types/requests";
import { RequestDocumentProvenanceBadge } from "./request-document-provenance-badge";
import { SettlementUploadFileRow } from "./settlement-preparation/settlement-upload-file-row";

interface RequestExtraDocumentsModalProps {
  request: PaymentRequest;
  documents: RequestDocument[];
  onRefresh: () => Promise<void>;
  unavailable?: boolean;
  refreshing?: boolean;
  initialOpen?: boolean;
}

export function RequestExtraDocumentsModal(props: RequestExtraDocumentsModalProps) {
  const user = useAuthStore((state) => state.user);
  const role = user?.role?.code;
  const context = props.unavailable ? undefined : getExtraDocumentMutationContext(props.request, user?.id, role);
  const [open, setOpen] = useState(() => props.initialOpen === true && Boolean(context));
  if (role !== ROLE_CODE.GIOF_MANAGER && role !== ROLE_CODE.GIOF_GESTOR) return null;
  return <>
    <Button type="button" variant="outline" disabled={!context || props.refreshing} onClick={() => setOpen(true)}>Gestionar documentos extra</Button>
    {!context && <p className="text-sm text-muted-foreground">Documentos extra: disponibles para GIOF activo con acceso de lectura en solicitudes no borrador. Actualiza la vista para verificar tu acceso.</p>}
    {open && <ExtraDocumentsSession {...props} context={context} actorId={user?.id} role={role} onClose={() => setOpen(false)} />}
  </>;
}

interface ExtraDocumentsSessionProps extends RequestExtraDocumentsModalProps {
  context?: ExtraRequestDocumentMutationContext;
  actorId?: string;
  role?: string;
  onClose: () => void;
}
interface FileDraft { file: File; title: string }

function savedDocumentName(document: RequestDocument): string {
  return document.document_category === REQUEST_DOCUMENT_CATEGORY.OTHER
    ? getOtherDocumentBusinessMetadata(document).displayName
    : getRequestDocumentDisplayName(document);
}

function ExtraDocumentsSession({ request, documents, context, actorId, role, unavailable, refreshing, onRefresh, onClose }: ExtraDocumentsSessionProps) {
  const [category, setCategory] = useState<RequestDocumentCategory | "">("");
  const [drafts, setDrafts] = useState<FileDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmedOnce, setConfirmedOnce] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef(new AbortController());
  const inFlight = useRef(false);
  const alive = useRef(true);
  const refreshWaiters = useRef(new Set<() => void>());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const originalIdentity = useRef({ requestId: request.id, actorId, role });
  const latest = useRef({
    request, actorId, role, unavailable, refreshing, blocked,
  });
  latest.current = {
    request, actorId, role, unavailable, refreshing, blocked,
  };
  const mutation = useUploadExtraRequestDocument(currentContext);
  const contextChanged = !context
    || request.id !== originalIdentity.current.requestId || actorId !== originalIdentity.current.actorId
    || role !== originalIdentity.current.role;
  // Un refresco suspende nuevas acciones; no revoca por sí solo la sesión ni su cola.
  const canMutate = !blocked && !contextChanged && !refreshing;

  useEffect(() => {
    // El setup debe restaurar los recursos que el cleanup cancela (también en Strict Mode).
    alive.current = true;
    if (abort.current.signal.aborted) abort.current = new AbortController();
    const controller = abort.current;
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!contextChanged) return;
    abort.current.abort();
    setBlocked(true);
    setError("Actualiza la vista y vuelve a abrir la gestión: cambió tu autorización de acceso.");
  }, [contextChanged]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (refreshing && !contextChanged) return;
    refreshWaiters.current.forEach((resume) => resume());
  }, [refreshing, contextChanged]);

  function currentContext(): ExtraRequestDocumentMutationContext {
    const current = latest.current;
    if (current.blocked) {
      throw new Error(
        "La carga se detuvo tras un rechazo. Revisa el error del archivo anterior antes de continuar.",
      );
    }
    const fresh = current.unavailable || current.refreshing ? undefined : getExtraDocumentMutationContext(current.request, current.actorId, current.role);
    if (!fresh || abort.current.signal.aborted
      || current.request.id !== originalIdentity.current.requestId || current.actorId !== originalIdentity.current.actorId
      || current.role !== originalIdentity.current.role) {
      throw new Error("Actualiza la vista y vuelve a abrir la gestión: el contexto ya no está vigente.");
    }
    return { ...fresh, signal: abort.current.signal };
  }
  async function uploadDocument(id: string, input: UploadRequestDocumentInput) {
    try {
      // Una lectura en curso suspende el siguiente archivo, sin convertirlo en un fallo permanente.
      while (latest.current.refreshing && !abort.current.signal.aborted) {
        await new Promise<void>((resolve) => {
          const signal = abort.current.signal;
          const resume = () => {
            refreshWaiters.current.delete(resume);
            signal.removeEventListener("abort", resume);
            resolve();
          };
          refreshWaiters.current.add(resume);
          signal.addEventListener("abort", resume, { once: true });
        });
      }
      return await mutation.uploadDocument(id, input);
    }
    catch (cause) {
      const retryable = isRetryableRequestDocumentUploadError(cause);
      if (alive.current) {
        if (!retryable) setBlocked(true);
        setError(
          `${getApiErrorMessage(cause)}${retryable ? " Reintenta el mismo archivo cuando termine la actualización." : ""}`,
        );
      }
      // Se conserva la identidad de la cola; el refresco no reenvía el archivo.
      try { await onRefresh(); }
      catch { if (alive.current) { setBlocked(true); setError("Actualiza la vista: no se pudo refrescar el estado de los documentos."); } }
      throw cause;
    }
  }
  const queue = useRequestDocumentUploadQueue({ requestId: request.id, requestType: request.request_type, documents, uploadDocument, refreshDocuments: onRefresh });
  const busy = deleting || queue.isRunning;
  useUploadNavigationGuard({ active: queue.isNavigationBlocked || deleting || drafts.length > 0, message: "Hay documentos extra pendientes. El servidor puede terminar un archivo en curso aunque salgas." });
  const selected = documents.find((document) => document.id === selectedId && document.document_purpose === "EXTRA");

  function close() {
    if (busy || inFlight.current) return;
    if (!discard && (drafts.length || queue.isNavigationBlocked)) { setDiscard(true); return; }
    onClose();
  }
  function cancelDelete() {
    if (inFlight.current) return;
    setSelectedId(null); setConfirmedOnce(false);
    requestAnimationFrame(() => actionRef.current?.focus());
  }
  async function remove() {
    if (inFlight.current || busy || !canMutate || !confirmedOnce || !selected) return;
    inFlight.current = true; setDeleting(true);
    try {
      await deleteExtraRequestDocument(request.id, selected.id, currentContext());
      invalidateRequestDomain(request.id);
      if (alive.current && !abort.current.signal.aborted) {
        toast.success("Documento extra eliminado correctamente");
        setSelectedId(null); setConfirmedOnce(false);
        requestAnimationFrame(() => actionRef.current?.focus());
      }
    } catch (cause) {
      if (alive.current && !abort.current.signal.aborted) { setError(`${getApiErrorMessage(cause)} Actualiza y vuelve a abrir la gestión.`); setBlocked(true); }
    } finally {
      // Sin eliminación optimista: incluso ante error se vuelve a leer el estado del servidor.
      try { await onRefresh(); } catch { if (alive.current) { setError("Actualiza la vista: no se pudo refrescar el estado de los documentos."); setBlocked(true); } }
      inFlight.current = false;
      if (alive.current) setDeleting(false);
    }
  }
  const options = REQUEST_DOCUMENT_CATEGORY_OPTIONS.filter((option) => option.value !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF && option.value !== REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF && option.value !== REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT);
  const invalidTitles = category === REQUEST_DOCUMENT_CATEGORY.OTHER && drafts.some((draft) => !draft.title.trim() || Boolean(validateOtherDocumentDisplayName(draft.title)));

  return <Dialog open onOpenChange={(value) => { if (!value) close(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" closeDisabled={busy}>
      <DialogHeader><DialogTitle>Gestión de documentos extra</DialogTitle><DialogDescription>Evidencia complementaria. No modifica pagos, requisitos ni totales del informe. Los documentos ordinarios se mantienen en su flujo habitual.</DialogDescription></DialogHeader>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>}
      {discard ? <>
        <p>¿Descartar los archivos pendientes y cerrar? Los documentos ya guardados permanecerán en el servidor.</p>
        <DialogFooter><Button onClick={() => setDiscard(false)}>Seguir gestionando</Button><Button variant="destructive" onClick={onClose}>Descartar pendientes y cerrar</Button></DialogFooter>
      </> : <>
        <div className="space-y-3">
          <label htmlFor="extra-category">Categoría extra</label>
          <select id="extra-category" className="w-full rounded-md border bg-background p-2" value={category} disabled={busy || !canMutate || drafts.length > 0 || queue.isNavigationBlocked} onChange={(event) => { queue.reset(); setCategory(event.target.value as RequestDocumentCategory | ""); }}>
            <option value="">Selecciona una categoría</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {category && <p className="text-sm text-muted-foreground">Formatos: {getRequestDocumentAcceptedFormatsLabel(category)}. Máximo 20 archivos por cola.</p>}
          <Input aria-label="Archivos extra" type="file" multiple accept={category ? getRequestDocumentAccept(category) : undefined} disabled={!category || busy || !canMutate} onChange={(event) => {
            const files = Array.from(event.target.files ?? []); event.target.value = "";
            if (category !== REQUEST_DOCUMENT_CATEGORY.OTHER) { queue.enqueue(files, { category: category as RequestDocumentCategory }); return; }
            const slots = Math.max(0, 20 - queue.items.length - drafts.length);
            if (files.length > slots) toast.error("La cola admite un máximo de 20 archivos.");
            setDrafts((current) => [...current, ...files.slice(0, slots).map((file) => ({ file, title: "" }))]);
          }} />
          {drafts.map((draft, index) => <div key={index} className="space-y-1">
            <Input aria-label={`Título de ${draft.file.name}`} placeholder="Nombre personalizado obligatorio" value={draft.title} disabled={busy || !canMutate} onChange={(event) => setDrafts((current) => current.map((value, position) => position === index ? { ...value, title: event.target.value } : value))} />
            <Button variant="outline" disabled={busy} onClick={() => setDrafts((current) => current.filter((_, position) => position !== index))}>Retirar selección {draft.file.name}</Button>
          </div>)}
          {drafts.length > 0 && <Button disabled={invalidTitles || busy || !canMutate} onClick={() => { queue.enqueue(drafts.map((draft) => draft.file), { category: REQUEST_DOCUMENT_CATEGORY.OTHER, fileTitles: drafts.map((draft) => draft.title) }); setDrafts([]); }}>Agregar a la cola</Button>}
          <ul className="space-y-2">{queue.items.map((item) => <SettlementUploadFileRow key={item.id} item={item} disabled={busy || !canMutate} onRetry={queue.retry} onRemove={queue.remove} />)}</ul>
          <Button disabled={busy || !canMutate || !queue.items.some((item) => item.state === REQUEST_DOCUMENT_UPLOAD_FILE_STATE.QUEUED)} onClick={queue.start}>Subir documentos extra</Button>
          {queue.isRunning && <Button variant="outline" onClick={() => { queue.pauseAfterCurrent(); abort.current.abort(); setBlocked(true); setError("Carga cancelada. Actualiza y vuelve a abrir: el archivo activo puede haber terminado en el servidor."); }}>Cancelar carga pendiente</Button>}
        </div>
        <div className="space-y-3">{documents.map((document) => {
          const name = savedDocumentName(document);
          const url = getSafeDocumentUrl(document.drive_web_url);
          return <div key={document.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span>{name}</span><RequestDocumentProvenanceBadge document={document} />
            {document.document_purpose === "EXTRA" && <Badge variant="outline">Extra</Badge>}
            {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${name}`}>Ver</a>}
            {document.document_purpose === "EXTRA" && <Button variant="outline" disabled={busy || !canMutate} aria-label={`Eliminar extra ${name}`} onClick={(event) => { actionRef.current = event.currentTarget; setSelectedId(document.id); setConfirmedOnce(false); }}>Eliminar extra</Button>}
          </div>;
        })}</div>
        {selected && <section aria-label="Confirmación de eliminación extra" className="space-y-2 rounded-md border p-3">
          <p>{confirmedOnce ? "Confirma nuevamente la eliminación de" : "¿Eliminar el documento extra"} {savedDocumentName(selected)}? Se enviará el archivo a la papelera de Drive. El servidor rechazará documentos vinculados o archivos compartidos.</p>
          <Button variant="outline" disabled={deleting} onClick={cancelDelete}>Cancelar eliminación</Button>
          {confirmedOnce ? <Button variant="destructive" disabled={busy || !canMutate} onClick={() => void remove()}>Confirmar eliminación extra</Button> : <Button disabled={busy || !canMutate} onClick={() => setConfirmedOnce(true)}>Continuar eliminación</Button>}
        </section>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>Cerrar gestión</Button></DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
