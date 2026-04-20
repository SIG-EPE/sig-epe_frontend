'use client'

import { User, Mail, CreditCard, Shield, Lock, Briefcase } from 'lucide-react'

import { useAuthStore } from '@/stores/auth-store'
import { ROLE_LABELS, type RoleCode } from '@/lib/constants'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ProfileSkeleton } from './profile-skeleton'

// -------------------------------------------------------
// Helper — get 2-char initials from first + last name
// -------------------------------------------------------

function getInitials(firstName: string, lastName: string): string {
  const first = firstName.charAt(0).toUpperCase()
  const last = lastName.charAt(0).toUpperCase()
  return `${first}${last}` || '?'
}

// -------------------------------------------------------
// ProfileView — Client Component
// -------------------------------------------------------

export function ProfileView() {
  const user = useAuthStore((state) => state.user)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading || !user) return <ProfileSkeleton />

  const fullName = `${user.firstName} ${user.lastName}`.trim()
  const initials = getInitials(user.firstName, user.lastName)
  const roleLabel = ROLE_LABELS[user.role.code as RoleCode] ?? user.role.name

  const authSourceLabel =
    user.authSource === 'LOCAL'
      ? 'Cuenta local'
      : user.authSource === 'EPE'
        ? 'Cuenta Enseña Perú'
        : '—'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Card 1 — Identity */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold">{fullName}</h2>
            <Badge>{roleLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Personal information */}
      <Card>
        <CardHeader>
          <CardTitle>Información personal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nombre */}
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Nombre</p>
                <p className="text-sm">{user.firstName ?? '—'}</p>
              </div>
            </div>

            {/* Apellido */}
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Apellido</p>
                <p className="text-sm">{user.lastName ?? '—'}</p>
              </div>
            </div>

            {/* DNI */}
            <div className="flex items-start gap-3">
              <CreditCard className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">DNI</p>
                <p className="text-sm">{user.documentNumber ?? '—'}</p>
              </div>
            </div>

            {/* Correo electrónico */}
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Correo electrónico
                </p>
                <p className="text-sm">{user.email ?? 'No configurado'}</p>
              </div>
            </div>

            {/* Tipo de cuenta */}
            <div className="flex items-start gap-3">
              <Shield className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Tipo de cuenta
                </p>
                <p className="text-sm">{authSourceLabel}</p>
              </div>
            </div>

            {/* Rol */}
            <div className="flex items-start gap-3">
              <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Rol</p>
                <p className="text-sm">{roleLabel}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3 — Security */}
      <Card>
        <CardHeader>
          <CardTitle>Seguridad</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper required — disabled buttons don't fire pointer events */}
                <span className="inline-block">
                  <Button disabled variant="outline">
                    <Lock className="mr-2 h-4 w-4" />
                    Cambiar contraseña
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Disponible próximamente</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  )
}
