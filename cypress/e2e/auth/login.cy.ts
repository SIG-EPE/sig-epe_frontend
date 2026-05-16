// cypress/e2e/auth/login.cy.ts
// Tests de login — usa datos REALES del backend (sin mocks)
// Admin: DNI 00000001, password Test2030#
// Estado BD: onboarding_completed=true → post-login redirige a /admin/users

export {};

const ADMIN_DNI = "00000001";
const ADMIN_PASSWORD = "Test2030#";
const WRONG_PASSWORD = "WrongPass999#";

describe("Login E2E", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("✅ Login exitoso con admin → redirige a /admin/users", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();

    // onboarding_completed=true → scope:full → ADMIN_SISTEMA va a /admin/users
    cy.url({ timeout: 10000 }).should("include", "/admin/users");
  });

  it("❌ Login con password incorrecta → muestra mensaje de error", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(WRONG_PASSWORD);
    cy.get('button[type="submit"]').click();

    cy.contains("DNI o contraseña incorrectos", { timeout: 8000 }).should("be.visible");
    cy.url().should("include", "/login");
  });

  it("✅ Ya autenticado y va a /login → redirige a /admin/users", () => {
    // Usar cy.login() para setear cookie sin pasar por UI
    cy.login(ADMIN_DNI, ADMIN_PASSWORD);
    cy.visit("/login");

    // Middleware detecta scope:full → redirige al home del rol
    cy.url({ timeout: 10000 }).should("include", "/admin/users");
  });

  it("✅ Banner de inactividad visible al llegar con ?reason=inactivity", () => {
    cy.visit("/login?reason=inactivity");
    cy.contains("Tu sesión fue cerrada por inactividad.", { timeout: 6000 }).should("be.visible");
    cy.url().should("include", "/login");
  });
});
