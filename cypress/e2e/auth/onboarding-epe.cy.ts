// cypress/e2e/auth/onboarding-epe.cy.ts
// Tests de onboarding para usuario EPE (76050578)
// Estado BD: onboarding_completed=true → los tests de onboarding están en .skip
// Para activarlos: resetear onboarding_completed=false en BD de prueba

export {};

const EPE_DNI = '76050578';
const EPE_PASSWORD = '76050578';

describe('Onboarding EPE E2E', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  // @requires-reset — onboarding_completed debe ser false en BD
  it.skip('✅ Login EPE → redirige a /onboarding', () => {
    cy.login(EPE_DNI, EPE_PASSWORD);
    cy.visit('/onboarding');
    cy.url({ timeout: 10000 }).should('include', '/onboarding');
  });

  // @requires-reset — onboarding_completed debe ser false en BD
  it.skip('✅ Formulario de onboarding contiene campos requeridos', () => {
    cy.login(EPE_DNI, EPE_PASSWORD);
    cy.visit('/onboarding');
    cy.url({ timeout: 10000 }).should('include', '/onboarding');

    cy.get('input[autocomplete="email"]').should('exist');
    cy.get('button[type="submit"]').should('exist');
  });

  // @mutating — modifica onboarding_completed en BD; correr solo con BD de prueba reseteada
  it.skip('✅ Completar onboarding → redirige a /requests (home EMPLEADO_EPE)', () => {
    const NEW_EMAIL = `test+${Date.now()}@example.com`;

    cy.login(EPE_DNI, EPE_PASSWORD);
    cy.visit('/onboarding');
    cy.url({ timeout: 10000 }).should('include', '/onboarding');

    cy.get('input[autocomplete="email"]').type(NEW_EMAIL);
    cy.get('button[type="submit"]').click();

    // EMPLEADO_EPE → home: /requests, NOT /admin/users
    cy.url({ timeout: 10000 }).should('include', '/requests');
    cy.url().should('not.include', '/admin/users');
  });
});
