// src/components/profile/__tests__/profile-view.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// -------------------------------------------------------
// Mocks
// -------------------------------------------------------

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
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

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe('ProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(screen.getByText('No configurado')).toBeInTheDocument()
  })

  it('✅ botón cambiar contraseña está deshabilitado', () => {
    mockStore({ user: baseUser, isLoading: false })
    render(<ProfileView />)
    const btn = screen.getByRole('button', { name: /cambiar contraseña/i })
    expect(btn).toBeDisabled()
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
})
