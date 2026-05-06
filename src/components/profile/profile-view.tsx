'use client'

import { useState } from 'react'
import { User, Mail, CreditCard, Shield, Briefcase } from 'lucide-react'
import { toast } from 'sonner'

import { useAuthStore } from '@/stores/auth-store'
import { useProfile } from '@/hooks/use-profile'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const isAuthLoading = useAuthStore((state) => state.isLoading)
  const { updateProfile, isLoading: isSaving } = useProfile()

  const isEpe = user?.authSource === 'EPE'

  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')

  if (isAuthLoading || !user) return <ProfileSkeleton />

  const fullName = `${user.firstName} ${user.lastName}`.trim()
  const initials = getInitials(user.firstName, user.lastName)
  const roleLabel = ROLE_LABELS[user.role?.code as RoleCode] ?? user.role?.name ?? '—'

  const authSourceLabel =
    user.authSource === 'LOCAL'
      ? 'Cuenta local'
      : user.authSource === 'EPE'
        ? 'Cuenta Enseña Perú'
        : '—'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile({
        email: email || undefined,
        firstName: isEpe ? undefined : firstName || undefined,
        lastName: isEpe ? undefined : lastName || undefined,
      })
      toast.success('Perfil actualizado exitosamente')
    } catch {
      toast.error('Error al actualizar perfil')
    }
  }

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

      {/* Card 2 — Editable personal information */}
      <Card>
        <CardHeader>
          <CardTitle>Información personal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Nombre
                </Label>
                {isEpe ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          id="firstName"
                          value={firstName}
                          disabled
                          className="cursor-not-allowed"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Campo gestionado por Enseña Perú</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                )}
              </div>

              {/* Apellido */}
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Apellido
                </Label>
                {isEpe ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          id="lastName"
                          value={lastName}
                          disabled
                          className="cursor-not-allowed"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Campo gestionado por Enseña Perú</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                )}
              </div>

              {/* Correo electrónico — siempre editable */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="No configurado"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Card 3 — Read-only fields */}
      <Card>
        <CardHeader>
          <CardTitle>Información de cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* DNI */}
            <div className="flex items-start gap-3">
              <CreditCard className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">DNI</p>
                <p className="text-sm">{user.documentNumber ?? '—'}</p>
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

    </div>
  )
}
