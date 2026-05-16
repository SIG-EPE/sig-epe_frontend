// cypress/e2e/auth/inactivity.cy.ts
// Tests de cierre de sesión por inactividad
// Usa cy.clock() + cy.tick() para simular el paso del tiempo
// IMPORTANTE: cy.clock() debe instalarse ANTES de cy.login() y cy.visit()

export {};

const EPE_DNI = '76050578';
const EPE_PASSWORD = '76050578';

const WARNING_MS = 110 * 60 * 1000; // 110 minutos — momento en que aparece el modal de advertencia
const TIMEOUT_MS = 120 * 60 * 1000; // 120 minutos — cierre automático de sesión

describe('Inactividad E2E', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    // cy.clock() DEBE instalarse ANTES del login para controlar el timer desde t=0
    cy.clock();
    cy.login(EPE_DNI, EPE_PASSWORD);
    cy.visit('/dashboard');
  });

  afterEach(() => {
    cy.clock().then((clock) => clock.restore());
  });

  it('✅ Modal de advertencia aparece a los 110 minutos de inactividad', () => {
    // Precondición: usuario autenticado en /dashboard, cy.clock() activo desde t=0
    // Avanzar el reloj 110 minutos sin actividad del usuario
    cy.tick(WARNING_MS);

    // El modal de advertencia de inactividad debe aparecer
    cy.contains('Continuar sesión', { timeout: 6000 }).should('be.visible');
  });

  it('✅ "Continuar sesión" cierra el modal y resetea el timer', () => {
    // Precondición: usuario autenticado, cy.clock() activo desde t=0
    // Avanzar a los 110 minutos — modal debe aparecer
    cy.tick(WARNING_MS);
    cy.contains('Continuar sesión', { timeout: 6000 }).should('be.visible');

    // Hacer clic en "Continuar sesión" para resetear el timer
    cy.contains('Continuar sesión').click();

    // El modal debe desaparecer
    cy.contains('Continuar sesión').should('not.exist');

    // Avanzar 110 minutos adicionales — NO debe haber redirect (timer fue reseteado)
    cy.tick(WARNING_MS);
    cy.url().should('include', '/dashboard');
  });

  it('✅ Inactividad de 120 minutos → redirect a /login?reason=inactivity', () => {
    // Next.js router.push() lanza NEXT_REDIRECT como excepción no capturada —
    // es comportamiento esperado del framework, no un error real del test.
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('NEXT_REDIRECT')) return false;
    });

    // Precondición: usuario autenticado, cy.clock() activo desde t=0, sin interacción
    // Avanzar el reloj 120 minutos — debe cerrar la sesión automáticamente
    cy.tick(TIMEOUT_MS);

    // Debe redirigir a /login con el query param reason=inactivity
    cy.url({ timeout: 10000 }).should('include', '/login');
    cy.url().should('include', 'reason=inactivity');
  });
});
