"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import {
  useUsers,
  type UserDto,
} from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
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
import { UserRow } from "@/components/admin/users/user-row";
import { CreateUserModal } from "@/components/admin/users/create-user-modal";
import { EditUserModal } from "@/components/admin/users/edit-user-modal";
import { DeactivateUserModal } from "@/components/admin/users/deactivate-user-modal";
import { ReactivateUserModal } from "@/components/admin/users/reactivate-user-modal";

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

const PAGE_SIZE = 20;

// -------------------------------------------------------
// Page
// -------------------------------------------------------

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<UserDto | null>(null);
  const [reactivatingUser, setReactivatingUser] = useState<UserDto | null>(null);

  const { users, total, isLoading, error, refetch } = useUsers(page, PAGE_SIZE);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleEdit = (user: UserDto) => setEditingUser(user);
  const handleDeactivate = (user: UserDto) => setDeactivatingUser(user);
  const handleReactivate = (user: UserDto) => setReactivatingUser(user);

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
          <h1 className="text-2xl font-bold tracking-tight">Gestion de Usuarios</h1>
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
                  <UserRow
                    key={user.id}
                    user={user}
                    onRefetch={refetch}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                    onReactivate={handleReactivate}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Pagina {page} de {totalPages}
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

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={refetch}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => { setEditingUser(null); refetch(); }}
        />
      )}

      {deactivatingUser && (
        <DeactivateUserModal
          user={deactivatingUser}
          onClose={() => setDeactivatingUser(null)}
          onSuccess={() => { setDeactivatingUser(null); refetch(); }}
        />
      )}

      {reactivatingUser && (
        <ReactivateUserModal
          user={reactivatingUser}
          onClose={() => setReactivatingUser(null)}
          onSuccess={() => { setReactivatingUser(null); refetch(); }}
        />
      )}
    </div>
  );
}