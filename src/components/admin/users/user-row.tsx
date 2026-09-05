"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  useAssignRole,
  type UserDto,
} from "@/hooks/use-users";
import { ROLE_CODE } from "@/lib/constants";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import { useAuthStore } from "@/stores/auth-store";
import { GiofMembershipModal } from "@/components/admin/users/giof-membership-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, Pencil, Shield, UserMinus, Mail } from "lucide-react";

// Roles disponibles para asignacion
const ROLES = [
  { code: "SOLICITANTE_EPE", label: "Solicitante EPE" },
  { code: "GIOF_GESTOR", label: "GIOF Gestor" },
  { code: "GIOF_MANAGER", label: "GIOF Manager" },
  { code: "AUDITOR_DIRECCION", label: "Auditor Direccion" },
  { code: "ADMIN_SISTEMA", label: "Admin Sistema" },
] as const;

// Jerarquia de roles: nivel mas alto = mas poder
// RN: actorLevel > targetLevel para poder gestionar (strict >, no >=)
const ROLE_LEVELS: Record<string, number> = {
  ADMIN_SISTEMA: 5,
  GIOF_GESTOR: 3,
  GIOF_MANAGER: 4,
  AUDITOR_DIRECCION: 2,
  SOLICITANTE_EPE: 1,
};

function canManage(actorRoleCode: string, targetRoleCode: string): boolean {
  const actorLevel = ROLE_LEVELS[actorRoleCode] ?? 0;
  const targetLevel = ROLE_LEVELS[targetRoleCode] ?? 0;
  return actorLevel > targetLevel;
}

interface UserRowProps {
  user: UserDto;
  onRefetch: () => void;
  onEdit: (user: UserDto) => void;
  onDeactivate: (user: UserDto) => void;
  onReactivate: (user: UserDto) => void;
}

export function UserRow({ user, onRefetch, onEdit, onDeactivate, onReactivate }: UserRowProps) {
  const { assignRole } = useAssignRole();
  const currentUser = useAuthStore((state) => state.user);
  const [giofMembershipEnabled, setGiofMembershipEnabled] = useState<boolean | null>(null);

  const currentRole = user.roles[0];
  const myRoleCode = currentUser?.role?.code ?? "";

  // Determinar si el usuario actual puede gestionar al usuario de esta fila
  const targetRoleCode = currentRole?.code ?? "";
  const canManageThis = hasRoleCapability(myRoleCode, ROLE_CAPABILITY.USER_ADMIN)
    && canManage(myRoleCode, targetRoleCode);
  const isOtherUser = Boolean(currentUser?.id && currentUser.id !== user.id);
  const canGrantGiof =
    hasRoleCapability(myRoleCode, ROLE_CAPABILITY.GIOF_MEMBERSHIP_MANAGE) &&
    isOtherUser &&
    user.isActive &&
    targetRoleCode === ROLE_CODE.SOLICITANTE_EPE;
  const canRevokeGiof =
    hasRoleCapability(myRoleCode, ROLE_CAPABILITY.GIOF_MEMBERSHIP_MANAGE) &&
    isOtherUser &&
    targetRoleCode === ROLE_CODE.GIOF_GESTOR;

  const createdDate = new Date(user.createdAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const handleAssignRole = async (roleCode: string) => {
    // Verificar jerarquia antes de asignar (el backend тоже checkea, pero por UX)
    if (!canManage(myRoleCode, roleCode)) {
      toast.error("No puedes asignar un rol de igual o mayor nivel al tuyo");
      return;
    }
    try {
      await assignRole(user.id, roleCode);
      toast.success(
        `Rol actualizado a ${ROLES.find((r) => r.code === roleCode)?.label ?? roleCode}`,
      );
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al asignar rol");
    }
  };

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
        <Badge variant={user.isActive ? "default" : "destructive"} className="text-xs">
          {user.isActive ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{createdDate}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {/* Menu de 3 puntos */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Editar — solo si puede gestionar */}
              {canManageThis ? (
                <DropdownMenuItem onClick={() => onEdit(user)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}

              {/* Submenu cambiar rol — solo si puede gestionar */}
              {canManageThis ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Shield className="mr-2 h-4 w-4" />
                    Asignar rol
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {ROLES.map((r) => (
                      <DropdownMenuItem
                        key={r.code}
                        onClick={() => void handleAssignRole(r.code)}
                        className={currentRole?.code === r.code ? "font-semibold" : ""}
                      >
                        {r.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem disabled>
                  <Shield className="mr-2 h-4 w-4" />
                  Asignar rol
                </DropdownMenuItem>
              )}

              {(canGrantGiof || canRevokeGiof) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setGiofMembershipEnabled(canGrantGiof)}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    {canGrantGiof ? "Conceder rol GIOF" : "Retirar rol GIOF"}
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              {/* Desactivar / Reactivar — solo si puede gestionar */}
              {user.isActive ? (
                canManageThis ? (
                  <DropdownMenuItem
                    onClick={() => onDeactivate(user)}
                    className="text-destructive focus:text-destructive"
                  >
                    <UserMinus className="mr-2 h-4 w-4" />
                    Desactivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled className="text-destructive">
                    <UserMinus className="mr-2 h-4 w-4" />
                    Desactivar
                  </DropdownMenuItem>
                )
              ) : (
                canManageThis ? (
                  <DropdownMenuItem
                    onClick={() => onReactivate(user)}
                    className="text-green-600 focus:text-green-600"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Reactivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled className="text-green-600">
                    <Mail className="mr-2 h-4 w-4" />
                    Reactivar
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
      {giofMembershipEnabled !== null && (
        <GiofMembershipModal
          user={user}
          enabled={giofMembershipEnabled}
          onClose={() => setGiofMembershipEnabled(null)}
          onSuccess={onRefetch}
        />
      )}
    </TableRow>
  );
}
