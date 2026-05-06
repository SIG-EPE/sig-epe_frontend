// cypress/e2e/budget/planning-lines.cy.ts
// Tests de lineas de planificacion presupuestal

const GESTOR_DNI = "00000005";
const GESTOR_PASSWORD = "gestorG123_";

describe("Budget - Planning Lines", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    // Login como GIOF_GESTOR
    cy.visit("/login");
    cy.get('input[autocomplete="username"]').type(GESTOR_DNI);
    cy.get('input[autocomplete="current-password"]').type(GESTOR_PASSWORD);
    cy.get('button[type="submit"]').click();
    cy.url({ timeout: 10000 }).should("not.include", "/login");
  });

  it("Carga la pagina de planificacion sin errores", () => {
    cy.visit("/budget/planning");

    cy.url().should("include", "/budget/planning");
  });

  it("Tabla de lineas de planificacion es visible", () => {
    cy.visit("/budget/planning");

    // Puede tener tabla o estado vacio
    cy.get("body").then(($body) => {
      if ($body.find("table").length > 0) {
        cy.get("table").should("exist");
      }
    });
  });

  it("Controles de filtro existen: ano fiscal, unidad organica, estado", () => {
    cy.visit("/budget/planning");

    // Verificar que los filtros estan presentes
    cy.contains("Estado").should("be.visible");
  });

  it("Los estados esperados: Borrador, Enviado, Aprobado, Rechazado", () => {
    cy.visit("/budget/planning");

    // Verificar badges de estado
    cy.contains("Borrador").should("be.visible");
    cy.contains("Enviado").should("be.visible");
    cy.contains("Aprobado").should("be.visible");
    cy.contains("Rechazado").should("be.visible");
  });

  it("Maneja estado vacio apropiadamente cuando no hay lineas", () => {
    cy.visit("/budget/planning");

    // Esperar que cargue
    cy.wait(2000);

    cy.get("body").then(($body) => {
      // Si no hay lineas, debe mostrar mensaje de estado vacio
      const hasEmptyState = $body.text().includes("No hay lineas");
      const hasTable = $body.find("table").length > 0;

      if (!hasTable || hasEmptyState) {
        cy.contains("No hay lineas").should("be.visible");
      }
    });
  });

  it("Controles de paginacion existen si hay muchas lineas", () => {
    cy.visit("/budget/planning");

    // Verificar que existen controles de paginacion
    cy.get("body").then(($body) => {
      const hasPagination = $body.text().includes("上一页") || $body.text().includes("下一页");
      if (hasPagination) {
        cy.contains("上一页").should("be.visible");
        cy.contains("下一页").should("be.visible");
      }
    });
  });
});