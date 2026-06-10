// src/components/profile/__tests__/profile-view.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// -------------------------------------------------------
// Mocks
// -------------------------------------------------------

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/profile',
}))

// -------------------------------------------------------
// Imports (AFTER mocks)
// -------------------------------------------------------

import { ProfileView } from '@/components/profile/profile-view'
import { useAuthStore } from '@/stores/auth-store'
import { useProfile } from '@/hooks/use-profile'
import type { AuthUser } from '@/types/auth'

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

type MockState = { user: AuthUser | null; isLoading: boolean }

function mockStore(state: MockState) {
  vi.mocked(useAuthStore).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selector: (s: any) => unknown) => selector(state)
  )
}

const baseUser: AuthUser = {
  id: '1',
  firstName: 'Administrador',
  lastName: 'Sistema',
  email: 'admin@test.com',
  documentNumber: '00000001',
  role: { code: 'ADMIN_SISTEMA', name: 'Administrador del Sistema' },
  onboardingCompleted: true,
  authSource: 'LOCAL',
}

const updateProfileMock = vi.fn()

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe('ProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useProfile).mockReturnValue({
      updateProfile: updateProfileMock,
      isLoading: false,
    })
  })

  it('✅ muestra skeleton cuando user es null', () => {
    mockStore({ user: null, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByTestId('profile-skeleton')).toBeInTheDocument()
  })

  it('✅ muestra skeleton cuando isLoading es true', () => {
    mockStore({ user: null, isLoading: true })
    render(<ProfileView />)
    expect(screen.getByTestId('profile-skeleton')).toBeInTheDocument()
  })

  it('✅ muestra nombre completo del usuario', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByText('Administrador Sistema')).toBeInTheDocument()
  })

  it('✅ muestra badge con nombre del rol en español', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)
    // ROLE_LABELS['ADMIN_SISTEMA'] = 'Administrador del Sistema'
    const labels = screen.getAllByText('Administrador del Sistema')
    expect(labels.length).toBeGreaterThan(0)
  })

  it('✅ muestra DNI del usuario', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByText('00000001')).toBeInTheDocument()
  })

  it('✅ muestra "No configurado" cuando email es null', () => {
    mockStore({ user: { ...baseUser, email: null }, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByPlaceholderText('No configurado')).toBeInTheDocument()
  })

  it('✅ muestra botón cambiar contraseña deshabilitado para usuarios LOCAL', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)
    const btn = screen.getByRole('button', { name: /cambiar contraseña/i })
    expect(btn).toBeDisabled()
  })

  it('✅ no muestra botón cambiar contraseña para usuarios EPE', () => {
    mockStore({ user: { ...baseUser, authSource: 'EPE' }, isLoading: false })
    render(<ProfileView />)
    expect(
      screen.queryByRole('button', { name: /cambiar contraseña/i })
    ).not.toBeInTheDocument()
  })

  it('✅ muestra tipo de cuenta LOCAL correctamente', () => {
    mockStore({ user: { ...baseUser, authSource: 'LOCAL' }, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByText('Cuenta local')).toBeInTheDocument()
  })

  it('✅ muestra tipo de cuenta EPE correctamente', () => {
    mockStore({ user: { ...baseUser, authSource: 'EPE' }, isLoading: false })
    render(<ProfileView />)
    expect(screen.getByText('Cuenta Enseña Perú')).toBeInTheDocument()
  })

  it('permite guardar perfil con correo válido no corporativo y muestra recomendación', async () => {
    updateProfileMock.mockResolvedValue(undefined)
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'persona@gmail.com' },
    })

    expect(
      screen.getByText(/recomendamos usar tu correo corporativo/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith({
        email: 'persona@gmail.com',
        firstName: 'Administrador',
        lastName: 'Sistema',
      })
    })
  })

  it('no muestra recomendación para correo corporativo recomendado', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'persona@ensenaperu.org' },
    })

    expect(
      screen.queryByText(/recomendamos usar tu correo corporativo/i)
    ).not.toBeInTheDocument()
  })

  it('bloquea guardar perfil cuando el formato de correo es inválido', async () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'not-an-email' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText(/ingresa un correo válido/i)).toBeInTheDocument()
    expect(updateProfileMock).not.toHaveBeenCalled()
  })
})
