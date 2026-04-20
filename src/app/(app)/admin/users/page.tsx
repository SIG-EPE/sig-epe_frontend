"use client";

import { useState } from "react";
import { Plus, UserMinus, Shield } from "lucide-react";
import { toast } from "sonner";

import {
  useUsers,
  useAssignRole,
  useDeactivateUser,
  useCreateUser,
  type UserDto,
  type CreateUserPayload,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

const ROLES = [
  { code: "SOLICITANTE_EPE", label: "Solicitante EPE" },
  { code: "PATROCINADOR", label: "Patrocinador" },
  { code: "GIOF_GESTOR", label: "GIOF Gestor" },
  { code: "AUDITOR_DIRECCION", label: "Auditor Dirección" },
  { code: "ADMIN_SISTEMA", label: "Admin Sistema" },
] as const;

const PAGE_SIZE = 20;

// -------------------------------------------------------
// CreateUserModal
// -------------------------------------------------------

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { createUser, isLoading } = useCreateUser();
  const [form, setForm] = useState<CreateUserPayload>({
    firstName: "",
    lastName: "",
    epeDni: "",
    email: "",
    roleCode: "SOLICITANTE_EPE",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({
        ...form,
        email: form.email?.trim() || undefined,
      });
      toast.success("Usuario creado exitosamente");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear usuario");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Agregar usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Apellido *</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">DNI EPE *</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.epeDni}
              onChange={(e) => setForm((f) => ({ ...f, epeDni: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email (opcional)</label>
            <input
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Rol *</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.roleCode}
              onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}
              required
            >
              {ROLES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            La contraseña temporal será <strong>Temporal2030#</strong>. El usuario deberá cambiarla en su primer acceso.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creando..." : "Crear usuario"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// UserRow
// -------------------------------------------------------

interface UserRowProps {
  user: UserDto;
  onRefetch: () => void;
}

function UserRow({ user, onRefetch }: UserRowProps) {
  const { assignRole } = useAssignRole();
  const { deactivateUser } = useDeactivateUser();

  const handleAssignRole = async (roleCode: string) => {
    try {
      await assignRole(user.id, roleCode);
      toast.success(`Rol actualizado a ${ROLES.find((r) => r.code === roleCode)?.label ?? roleCode}`);
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al asignar rol");
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`¿Desactivar al usuario ${user.firstName} ${user.lastName}?`)) return;
    try {
      await deactivateUser(user.id);
      toast.success("Usuario desactivado");
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar usuario");
    }
  };

  const currentRole = user.roles[0];
  const createdDate = new Date(user.createdAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.firstName} {user.lastName}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.epeDni ?? "—"}</TableCell>
      <TableCell>{user.email ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell>
        {currentRole ? (
          <Badge variant="secondary" className="text-xs">
            {ROLES.find((r) => r.code === currentRole.code)?.label ?? currentRole.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">Sin rol</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={user.isActive ? "default" : "destructive"}
          className="text-xs"
        >
          {user.isActive ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{createdDate}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {/* Assign role */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Shield className="h-4 w-4" />
                <span className="sr-only">Asignar rol</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Asignar rol</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROLES.map((r) => (
                <DropdownMenuItem
                  key={r.code}
                  onClick={() => void handleAssignRole(r.code)}
                  className={currentRole?.code === r.code ? "font-semibold" : ""}
                >
                  {r.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Deactivate */}
          {user.isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => void handleDeactivate()}
            >
              <UserMinus className="h-4 w-4" />
              <span className="sr-only">Desactivar</span>
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// -------------------------------------------------------
// Page
// -------------------------------------------------------

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { users, total, isLoading, error, refetch } = useUsers(page, PAGE_SIZE);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>Dashboard</span>
        <span>/</span>
        <span>Admin</span>
        <span>/</span>
        <span className="font-medium text-foreground">Usuarios</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">
            Administra los usuarios del sistema SIG-EPE.{" "}
            {!isLoading && (
              <span className="text-sm">
                ({total} usuario{total !== 1 ? "s" : ""} en total)
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar usuario
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre completo</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <UserRow key={user.id} user={user} onRefetch={refetch} />
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create user modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}
