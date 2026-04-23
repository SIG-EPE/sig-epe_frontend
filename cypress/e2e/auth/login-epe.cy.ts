// cypress/e2e/auth/login-epe.cy.ts
// Tests de login con usuario EPE real (76050578)
// Estado BD: onboarding_completed=true → post-login redirige a /requests (home EMPLEADO_EPE)

export {};

const EPE_DNI = '76050578';
const EPE_PASSWORD = '76050578';
const WRONG_PASSWORD = 'WrongPass999#';

describe('Login EPE E2E', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('✅ Login EPE exitoso → redirige al home del rol (/requests)', () => {
    // onboarding_completed=true → scope:full → middleware redirige a /requests (EMPLEADO_EPE)
    cy.visit('/login');

    cy.get('input[autocomplete="username"]').type(EPE_DNI);
    cy.get('input[autocomplete="current-password"]').type(EPE_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.url({ timeout: 10000 }).should('include', '/requests');
  });

  it('❌ Password incorrecta → toast de error, permanece en /login', () => {
    cy.visit('/login');

    cy.get('input[autocomplete="username"]').type(EPE_DNI);
    cy.get('input[autocomplete="current-password"]').type(WRONG_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.contains('DNI o contraseña incorrectos', { timeout: 8000 }).should('be.visible');
    cy.url().should('include', '/login');
  });

  it('✅ Ruta protegida sin sesión → redirige a /login', () => {
    cy.visit('/dashboard');
    cy.url({ timeout: 10000 }).should('include', '/login');
  });
});
