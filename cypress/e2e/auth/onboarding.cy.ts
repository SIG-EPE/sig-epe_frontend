// cypress/e2e/auth/onboarding.cy.ts
// Tests de onboarding — flujo real con backend
// El admin (00000001) tiene onboarding_completed=false → irá a /onboarding al hacer login.

export {};

const ADMIN_DNI = "00000001";
const ADMIN_PASSWORD = "Test2030#";

describe("Onboarding E2E", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  /**
   * Test 1: Usuario con onboarding pendiente → redirige a /onboarding
   *
   * El usuario 00000001 tiene onboarding_completed=false → este test SÍ funciona.
   */
  it("✅ Login con usuario onboarding pendiente → redirige a /onboarding", () => {
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.url({ timeout: 10000 }).should("include", "/onboarding");
  });

  /**
   * Test 2: La página /onboarding muestra el formulario correcto
   *
   * Hace login y verifica que el formulario de onboarding está presente.
   */
  it("✅ Página /onboarding muestra formulario de email y password", () => {
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/onboarding");

    // El formulario de onboarding debe tener campos de email y nueva contraseña
    cy.get('input[autocomplete="email"]').should("exist");
    cy.get('input[autocomplete="new-password"]').should("exist");
    cy.get('button[type="submit"]').should("exist");
  });

  /**
   * Test 3: Completar onboarding → redirige a home del rol
   *
   * NOTA: Este test MODIFICA la BD (onboarding_completed pasa a true).
   * Después de correrlo, los demás tests que asumen onboarding_completed=false
   * dejarán de funcionar. Correr con precaución o en BD de prueba reseteada.
   */
  it.skip("✅ Completa onboarding (email + password) → redirige a home del rol", () => {
    // TODO: usar un usuario de prueba dedicado para este test (no el admin principal)
    // para no afectar el estado de los demás specs.
    const NEW_EMAIL = `test+${Date.now()}@example.com`;
    const NEW_PASSWORD = "NewPass123#";

    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/onboarding");

    cy.get('input[autocomplete="email"]').type(NEW_EMAIL);
    cy.get('input[autocomplete="new-password"]').first().type(NEW_PASSWORD);
    cy.get('input[autocomplete="new-password"]').last().type(NEW_PASSWORD);
    cy.get('button[type="submit"]').click();

    // ADMIN_SISTEMA → home: /admin/users
    cy.url({ timeout: 10000 }).should("include", "/admin/users");
  });

  /**
   * Test 4: Acceder a /onboarding estando no autenticado → redirige a /login
   */
  it("✅ /onboarding sin autenticación → redirige a /login", () => {
    cy.visit("/onboarding");
    cy.url({ timeout: 8000 }).should("include", "/login");
  });
});
