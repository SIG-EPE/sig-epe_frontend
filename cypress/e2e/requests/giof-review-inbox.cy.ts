// cypress/e2e/requests/giof-review-inbox.cy.ts
// Visibilidad E2E de GIOF: bandeja de revisión y acciones read-only.

export {};

const GIOF_DNI = String(Cypress.env("giofDni") ?? "76050578");

function readEnv(name: string): unknown {
  return Cypress.env(name) ?? Cypress.env(name.toLowerCase());
}

function requiredEnv(env: Record<string, unknown>, name: string): string {
  const value = env[name] ?? env[name.toLowerCase()] ?? readEnv(name);
  if ((typeof value === "string" || typeof value === "number") && String(value).trim().length > 0) {
    return String(value);
  }

  throw new Error(`Configura CYPRESS_${name}=<valor> para ejecutar este spec.`);
}

describe("Solicitudes Sprint 3 - bandeja GIOF", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.env(["giofPassword", "giofpassword"], { log: false }).then((env) => {
      cy.login(GIOF_DNI, requiredEnv(env, "giofPassword"));
    });
  });

  it("muestra la bandeja de revisión y permite abrir solicitudes enviadas si existen", () => {
    cy.visit("/requests");
    cy.get('[data-testid="requests-page-title"]', { timeout: 12000 }).should("contain", "Bandeja de revisión");
    cy.contains("Abre una solicitud enviada para observar, aprobar o rechazar.").should("be.visible");
    cy.contains("Solicitudes registradas").should("be.visible");
    cy.contains("Cargando solicitudes...", { timeout: 15000 }).should("not.exist");

    cy.get('[data-testid="requests-status-filter"]').click();
    cy.get('[role="option"]').contains("Enviadas").click();
    cy.contains("Cargando solicitudes...", { timeout: 15000 }).should("not.exist");

    cy.get("body").then(($body) => {
      const hasRows = $body.find('[data-testid="request-list-row"]').length > 0;

      if (!hasRows) {
        cy.contains("Aún no hay solicitudes registradas.").should("be.visible");
        return;
      }

      cy.get('[data-testid="request-list-row"]')
        .first()
        .within(() => {
          cy.contains("Enviado").should("be.visible");
          cy.get('[data-testid="request-detail-link"]').should("contain", "Gestionar").click();
        });

      cy.contains("Acciones de revisión", { timeout: 15000 }).should("be.visible");
      cy.contains("Observar").should("be.visible");
      cy.contains("Aprobar").should("be.visible");
      cy.contains("Rechazar").should("be.visible");
    });
  });
});
