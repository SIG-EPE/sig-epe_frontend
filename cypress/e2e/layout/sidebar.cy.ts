// cypress/e2e/layout/sidebar.cy.ts
// Tests del sidebar — requiere admin logueado

const ADMIN_DNI = "00000001";
const ADMIN_PASSWORD = "Admin2030#";

// Items del sidebar para ADMIN_SISTEMA según ROLE_MENU_MAP
const ADMIN_MENU_ITEMS = ["Usuarios", "Configuración"];

describe("Sidebar E2E", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    // Login como admin antes de cada test
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(ADMIN_DNI);
    cy.get('input[autocomplete="current-password"]').type(ADMIN_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("include", "/dashboard");
  });

  it("✅ Admin logueado → sidebar muestra items de ADMIN_SISTEMA", () => {
    // Verificar que los items del menú para ADMIN_SISTEMA están visibles
    ADMIN_MENU_ITEMS.forEach((label) => {
      cy.contains(label).should("be.visible");
    });

    // Verificar que NO aparecen items de otros roles
    cy.contains("Bandeja de Gestión").should("not.exist");
    cy.contains("Mis Solicitudes").should("not.exist");
  });

  it("✅ Sidebar colapsa y expande con el botón chevron", () => {
    // El sidebar comienza expandido
    cy.get('[aria-label="Colapsar sidebar"]').should("be.visible");

    // Colapsar
    cy.get('[aria-label="Colapsar sidebar"]').click();

    // Ahora debe mostrar el botón de expandir
    cy.get('[aria-label="Expandir sidebar"]', { timeout: 3000 }).should(
      "be.visible"
    );

    // Expandir de nuevo
    cy.get('[aria-label="Expandir sidebar"]').click();

    cy.get('[aria-label="Colapsar sidebar"]', { timeout: 3000 }).should(
      "be.visible"
    );
  });
});
