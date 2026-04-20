// cypress/e2e/auth/onboarding.cy.ts
// Tests de onboarding — flujo real con backend
// Nota: los tests de "usuario con onboarding pendiente" requieren
// un usuario de prueba con onboarding_required=true en la BD.
// El admin (00000001) tiene onboarding completo → útil para el test 3.

const ADMIN_DNI = "00000001";
const ADMIN_PASSWORD = "Admin2030#";

describe("Onboarding E2E", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  /**
   * Test 1: Usuario con onboarding pendiente → redirige a /onboarding
   *
   * Prerequisito: debe existir un usuario con onboarding_required=true en la BD.
   * Si no existe, este test pasará como "pending".
   * Descomenta y ajusta las credenciales cuando tengas ese usuario.
   */
  it.skip("✅ Usuario con onboarding pendiente → redirige a /onboarding", () => {
    // TODO: reemplazar con credenciales de usuario con onboarding pendiente
    const PENDING_DNI = "PENDING_USER_DNI";
    const PENDING_PASSWORD = "PendingUser@Pass1";

    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(PENDING_DNI);
    cy.get('input[autocomplete="current-password"]').type(PENDING_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.url({ timeout: 10000 }).should("include", "/onboarding");
  });

  /**
   * Test 2: Completa onboarding → redirige a /dashboard
   *
   * Prerequisito: usuario con onboarding_required=true
   * Descomenta cuando tengas ese usuario.
   */
  it.skip("✅ Completa onboarding (email + password) → redirige a /dashboard", () => {
    // TODO: credenciales + email único para el test
    const PENDING_DNI = "PENDING_USER_DNI";
    const PENDING_PASSWORD = "PendingUser@Pass1";
    const NEW_EMAIL = `test+${Date.now()}@example.com`;
    const NEW_PASSWORD = "NewPass123#";

    // Login con usuario pendiente
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(PENDING_DNI);
    cy.get('input[autocomplete="current-password"]').type(PENDING_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/onboarding");

    // Completar formulario de onboarding
    cy.get('input[autocomplete="email"]').type(NEW_EMAIL);
    cy.get('input[autocomplete="new-password"]').first().type(NEW_PASSWORD);
    // confirmPassword input (segundo new-password)
    cy.get('input[autocomplete="new-password"]').last().type(NEW_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.url({ timeout: 10000 }).should("include", "/dashboard");
    cy.contains("exitosamente").should("be.visible");
  });

  it("✅ Usuario con onboarding completo que va a /onboarding → redirige a /dashboard", () => {
    // Login con admin (onboarding completo)
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/dashboard");

    // Intentar ir a /onboarding
    cy.visit("/onboarding");

    // El middleware debe redirigir a /dashboard (scope = "full")
    cy.url({ timeout: 8000 }).should("include", "/dashboard");
  });
});
