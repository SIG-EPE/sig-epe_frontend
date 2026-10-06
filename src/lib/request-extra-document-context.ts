import { ROLE_CODE } from "@/lib/constants";
import {
  REQUEST_STATUS,
  type ExtraRequestDocumentMutationContext,
  type PaymentRequest,
} from "@/types/requests";

// Adaptador de lectura: nunca toma otra asignación ni adquiere un lease.
// La autorización definitiva (incluido el estado activo del actor) es transaccional en el servidor.
export function getExtraDocumentMutationContext(
  request: PaymentRequest,
  actorId?: string,
  role?: string,
): ExtraRequestDocumentMutationContext | undefined {
  const work = request.extra_document_context;
  if (
    !actorId ||
    (role !== ROLE_CODE.GIOF_MANAGER && role !== ROLE_CODE.GIOF_GESTOR) ||
    request.status === REQUEST_STATUS.DRAFT ||
    !work ||
    work.requestId !== request.id ||
    work.canMutate !== true ||
    work.readOnly !== false
  )
    return undefined;

  // Los campos de asignación y lease son informativos; EXTRA no usa credenciales financieras.
  return {};
}
