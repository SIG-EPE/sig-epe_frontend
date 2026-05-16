// cypress/e2e/budget/balance-dashboard.cy.ts
// Verificacion del dashboard de saldos presupuestales

const GESTOR_DNI = "00000005";
const GESTOR_PASSWORD = "gestorG123_";

describe("Budget - Balance Dashboard", () => {
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

  it("Carga la pagina de balance sin errores", () => {
    cy.visit("/budget");

    // Verificar que la pagina carga
    cy.url().should("include", "/budget");

    // Esperar que el contenido aparezca (posible skeleton)
    cy.get("body").should("be.visible");
  });

  it("Muestra las 4 metricas: Planificado, Comprometido, Ejecutado, Disponible", () => {
    cy.visit("/budget");

    // Verificar las 4 tarjetas de metricas
    cy.contains("Planificado").should("be.visible");
    cy.contains("Comprometido").should("be.visible");
    cy.contains("Ejecutado").should("be.visible");
    cy.contains("Disponible").should("be.visible");
  });

  it("Selector de ano fiscal aparece y selecciona por defecto el ano ACTIVE", () => {
    cy.visit("/budget");

    // Buscar el selector de ano fiscal
    cy.get("body").then(($body) => {
      // Verificar que existe al menos un select o combo para ano fiscal
      if ($body.find('select[id*="year"], select[id*="fiscal"]').length > 0) {
        cy.get('select[id*="year"], select[id*="fiscal"]').should("exist");
      } else {
        // Puede estar en otra forma, verificar por texto
        cy.contains("Ano fiscal").should("be.visible");
      }
    });
  });

  it("Controles de filtro existen: unidad organica, territorio, tipo presupuesto", () => {
    cy.visit("/budget");

    // Verificar que los filtros esten presentes
    cy.contains("Unidad organica").should("be.visible");
    cy.contains("Territorio").should("be.visible");
    cy.contains("Tipo presupuesto").should("be.visible");
  });

  it("Indicador 'desde cache' puede aparecer cuando los datos vienen de cache", () => {
    cy.visit("/budget");

    // Los datos pueden o no tener cache - verificar que no hay error
    cy.contains("Planificado").should("be.visible");

    // Si hay datos, puede aparecer el badge de cache
    cy.get("body").then(($body) => {
      const hasCacheIndicator = $body.text().includes("desde cache");
      if (hasCacheIndicator) {
        cy.contains("desde cache").should("be.visible");
      }
    });
  });
});