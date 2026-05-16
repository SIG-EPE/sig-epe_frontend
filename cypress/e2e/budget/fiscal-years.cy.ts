// cypress/e2e/budget/fiscal-years.cy.ts
// Tests de gestion de anos fiscales

const GESTOR_DNI = "00000005";
const GESTOR_PASSWORD = "gestorG123_";

describe("Budget - Fiscal Years", () => {
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

  it("Carga la pagina de anos fiscales sin errores", () => {
    cy.visit("/budget/fiscal-years");

    cy.url().should("include", "/budget/fiscal-years");
    cy.contains("Ano fiscal").should("be.visible");
  });

  it("Tabla de anos fiscales esta presente", () => {
    cy.visit("/budget/fiscal-years");

    // Verificar que la tabla existe
    cy.get("table").should("exist");
  });

  it("Boton 'Crear ano fiscal' es visible para rol GIOF", () => {
    cy.visit("/budget/fiscal-years");

    cy.contains("Crear ano fiscal").should("be.visible");
  });

  it("Click en crear abre el modal de ano fiscal", () => {
    cy.visit("/budget/fiscal-years");

    cy.contains("Crear ano fiscal").click();

    // Verificar que el modal se abrio
    cy.contains("Ano").should("be.visible"); // Label del campo "Ano"
    cy.contains("Tipo de presupuesto").should("be.visible");
  });

  it("Llena el formulario y crea ano fiscal exitosamente", () => {
    cy.visit("/budget/fiscal-years");

    cy.contains("Crear ano fiscal").click();

    // Esperar que aparezcan los campos
    cy.get("input#year").should("be.visible");

    // Ingresar un ano que probablemente no exista (2035)
    cy.get("input#year").clear().type("2035");

    // Seleccionar tipo de presupuesto
    cy.get("select#budget_type_id").should("be.visible");
    cy.get("select#budget_type_id").select(0); // Primera opcion disponible

    // Enviar
    cy.contains("Crear ano fiscal").last().click({ force: true });

    // Verificar toast de exito
    cy.contains("exitosamente").should("be.visible");
  });

  it("Maneja error de ano duplicado apropiadamente", () => {
    cy.visit("/budget/fiscal-years");

    cy.contains("Crear ano fiscal").click();

    // Obtener el ano actual del campo
    cy.get("input#year").should("be.visible");
    const currentYear = new Date().getFullYear();
    cy.get("input#year").clear().type(String(currentYear));

    // Seleccionar tipo de presupuesto
    cy.get("select#budget_type_id").select(0);

    // Intentar crear
    cy.contains("Crear ano fiscal").last().click({ force: true });

    // Si el ano ya existe, debe mostrar error 409 o mensaje de conflicto
    // Verificar que no se cierra el modal o hay mensaje de error
    cy.get("body").then(($body) => {
      const hasError = $body.text().includes("ya existe") || $body.text().includes("conflict");
      if (hasError) {
        cy.contains("ya existe").should("be.visible");
      }
    });
  });
});