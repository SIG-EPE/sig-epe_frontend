// cypress/e2e/budget/login-budget.cy.ts
// Login y verificacion de acceso para rol GIOF_GESTOR

export {};

const GESTOR_DNI = "00000005";
const GESTOR_PASSWORD = "gestorG123_";

describe("Budget Module - Login GIOF_GESTOR", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("Login exitoso con GIOF_GESTOR redirige al dashboard", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(GESTOR_DNI);
    cy.get('input[autocomplete="current-password"]').type(GESTOR_PASSWORD);
    cy.get('button[type="submit"]').click();

    // Verificar que redirige fuera del login
    cy.url({ timeout: 10000 }).should("not.include", "/login");
  });

  it("Sidebar muestra items relacionados al presupuesto para GIOF_GESTOR", () => {
    cy.visit("/login");

    cy.get('input[autocomplete="username"]').type(GESTOR_DNI);
    cy.get('input[autocomplete="current-password"]').type(GESTOR_PASSWORD);
    cy.get('button[type="submit"]').click();

    // Esperar a que cargue el dashboard
    cy.url({ timeout: 10000 }).should("not.include", "/login");

    // Verificar que aparecen opciones de presupuesto en sidebar
    cy.contains("Presupuesto").should("be.visible");
    cy.contains("Planificacion").should("be.visible");
    cy.contains("Anos fiscales").should("be.visible");
  });

  it("Usuario logueado que accede a /login es redirigido a su home", () => {
    // Usar el comando login para establecer la cookie
    cy.login(GESTOR_DNI, GESTOR_PASSWORD);

    cy.visit("/login");

    // GIOF_GESTOR debe ir a /budget como home del rol
    cy.url({ timeout: 10000 }).should("include", "/budget");
  });
});