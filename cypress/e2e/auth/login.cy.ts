// cypress/e2e/auth/login.cy.ts
// Tests de login — usa datos REALES del backend (sin mocks)
// Admin: DNI 00000001, password Admin2030#

const ADMIN_DNI = "00000001";
const ADMIN_PASSWORD = "Admin2030#";
const WRONG_PASSWORD = "WrongPass999#";

describe("Login E2E", () => {
  beforeEach(() => {
    // Clear cookies/session before each test
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("✅ Login exitoso con admin → redirige a /dashboard", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();

    // Esperar redirección al dashboard
    cy.url({ timeout: 10000 }).should("include", "/dashboard");
  });

  it("❌ Login con password incorrecta → muestra mensaje de error", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(WRONG_PASSWORD);
    cy.get('button[type="submit"]').click();

    // Sonner toast con mensaje de error
    cy.contains("DNI o contraseña incorrectos", { timeout: 8000 }).should(
      "be.visible"
    );

    // Debe permanecer en /login
    cy.url().should("include", "/login");
  });

  it("✅ Si ya está autenticado y va a /login → redirige a /dashboard", () => {
    // Primero hacer login real
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/dashboard");

    // Intentar ir a /login nuevamente
    cy.visit("/login");

    // El middleware debe redirigir a /dashboard
    cy.url({ timeout: 8000 }).should("include", "/dashboard");
  });
});
