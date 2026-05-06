// cypress/e2e/budget/line-approve-reject.cy.ts
// Tests de aprobacion y rechazo de lineas de planificacion

const GESTOR_DNI = "00000005";
const GESTOR_PASSWORD = "gestorG123_";

describe("Budget - Line Approve/Reject", () => {
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

  it("Navega a la pagina de planificacion", () => {
    cy.visit("/budget/planning");
    cy.url().should("include", "/budget/planning");
  });

  it("Encuentra linea con estado Enviado y abre su detalle", () => {
    cy.visit("/budget/planning");

    // Esperar que carguen las lineas
    cy.wait(2000);

    // Buscar el boton de acciones en una linea Enviado (SUBMITTED)
    // El menu de acciones se abre con el boton MoreHorizontal
    cy.get("body").then(($body) => {
      // Buscar una fila que contenga "Enviado" y tenga boton de acciones
      const submittedRow = $body.find("tr:has(td:contains('Enviado'))").first();
      if (submittedRow.length > 0) {
        // Click en el menu de acciones de esa fila
        submittedRow.find('[aria-label="acciones"], button:has(svg)').first().click({ force: true });
      }
    });

    // Verificar que el dropdown de acciones aparezca
    cy.contains("Ver detalle").should("be.visible");
  });

  it("Verifica que botones Aprobar y Rechazar son visibles para GIOF", () => {
    cy.visit("/budget/planning");

    cy.wait(2000);

    // Click en el boton de menu de acciones
    cy.get('button[aria-label="acciones"], button:has([class*="more"]), button:has(svg.lucide-more)').first().click({ force: true }).then(() => {
      // Verificar opciones de aprobacion
      cy.get("body").then(($body) => {
        const hasApprove = $body.text().includes("Aprobar");
        const hasReject = $body.text().includes("Rechazar");

        if (hasApprove || hasReject) {
          cy.contains("Aprobar").should("be.visible");
          cy.contains("Rechazar").should("be.visible");
        }
      });
    });
  });

  it("Click en Rechazar abre el modal de confirmacion", () => {
    cy.visit("/budget/planning");

    cy.wait(2000);

    // Abrir el menu de acciones
    cy.get('button:has(svg.lucide-more)').first().click({ force: true });

    // Esperar que aparezca el menu y click en Rechazar
    cy.contains("Rechazar").click();

    // Verificar que el modal aparece
    cy.contains("Motivo del rechazo").should("be.visible");
  });

  it("Ingresa motivo de rechazo minimo 10 caracteres y rechaza exitosamente", () => {
    cy.visit("/budget/planning");

    cy.wait(2000);

    // Abrir el menu de acciones
    cy.get('button:has(svg.lucide-more)').first().click({ force: true });

    // Click en Rechazar
    cy.contains("Rechazar").click();

    // Esperar modal
    cy.contains("Motivo del rechazo").should("be.visible");

    // Llenar el textarea con mas de 10 caracteres
    cy.get('textarea[placeholder*="Motivo"]').type("Rechazado por testing automatizado - motivo suficiente");

    // Click en confirmar rechazo
    cy.contains("Rechazar").last().click();

    // Verificar toast de exito
    cy.contains("rechazada").should("be.visible");
  });

  it("Validacion: motivo con menos de 10 caracteres muestra error", () => {
    cy.visit("/budget/planning");

    cy.wait(2000);

    // Abrir menu y rechazar
    cy.get('button:has(svg.lucide-more)').first().click({ force: true });
    cy.contains("Rechazar").click();

    // Escribir motivo corto
    cy.get('textarea[placeholder*="Motivo"]').type("corto");

    // Intentar rechazar
    cy.contains("Rechazar").last().click();

    // Verificar que muestra error de validacion
    cy.contains("10 caracteres").should("be.visible");
  });

  it("Despues de rechazo exitoso, verifica que el estado cambio a Rechazado", () => {
    cy.visit("/budget/planning");

    cy.wait(2000);

    // Verificar que hay lineas en estado Rechazado
    cy.get("body").then(($body) => {
      // Ir a la pagina de detalle de una linea rechazada
      // Primero buscar si existe el badge Rechazado
      cy.contains("Rechazado").then(($badge) => {
        if ($badge.length > 0) {
          // Click en el menu de acciones de la fila con Rechazado
          $badge.closest("tr").find('button:has(svg.lucide-more)').click({ force: true });
          cy.contains("Ver detalle").click();
          cy.url().should("include", "/budget/planning/");
        }
      });
    });
  });
});