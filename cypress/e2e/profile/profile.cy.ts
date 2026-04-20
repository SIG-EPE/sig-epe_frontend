// cypress/e2e/profile/profile.cy.ts
// Tests E2E para la página de Perfil — requiere backend corriendo en localhost:3001

const ADMIN_DNI = '00000001'
const ADMIN_PASSWORD = 'Admin2030#'

describe('Profile E2E', () => {
  beforeEach(() => {
    cy.clearCookies()
    cy.clearLocalStorage()
  })

  it('✅ navega a /profile desde el dropdown del nav-user', () => {
    cy.login(ADMIN_DNI, ADMIN_PASSWORD)
    cy.visit('/dashboard')

    // Abrir dropdown del nav-user (botón con avatar/iniciales del usuario)
    cy.get('[data-testid="nav-user-trigger"], button[aria-haspopup="menu"]')
      .first()
      .click()

    // Verificar que aparece el item "Mi perfil"
    cy.contains('Mi perfil').should('be.visible')

    // Click en Mi perfil
    cy.contains('Mi perfil').click()

    // Verificar URL
    cy.url({ timeout: 8000 }).should('include', '/profile')
  })

  it('✅ muestra datos del usuario admin en /profile', () => {
    cy.login(ADMIN_DNI, ADMIN_PASSWORD)
    cy.visit('/profile')

    // Nombre del usuario
    cy.contains('Administrador', { timeout: 8000 }).should('be.visible')

    // Label del rol en español
    cy.contains('Administrador del Sistema').should('be.visible')
  })

  it('✅ redirige a /login si no está autenticado', () => {
    // Sin login previo — visitar /profile directamente
    cy.visit('/profile')

    // El middleware debe redirigir a /login
    cy.url({ timeout: 8000 }).should('include', '/login')
  })
})
