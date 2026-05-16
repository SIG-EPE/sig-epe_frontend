// cypress/e2e/requests/requester-draft.cy.ts
// Flujo E2E de solicitante: crea un borrador y valida lista, detalle y edición.

export {};

const REQUESTER_DNI = String(Cypress.env("requesterDni") ?? "00000002");

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

function selectOption(triggerTestId: string, optionText: string): void {
  cy.get(`[data-testid="${triggerTestId}"]`).click();
  cy.get('[role="option"]').contains(optionText).click();
}

describe("Solicitudes Sprint 3 - solicitante crea borrador", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.env(["requesterPassword", "requesterpassword"], { log: false }).then((env) => {
      cy.login(REQUESTER_DNI, requiredEnv(env, "requesterPassword"));
    });
  });

  it("crea una solicitud en borrador y la verifica en lista, detalle y edición", () => {
    const marker = `CYPRESS Solicitud borrador ${Date.now()}`;

    cy.visit("/requests");
    cy.get('[data-testid="requests-page-title"]', { timeout: 12000 }).should("contain", "Mis Solicitudes");
    cy.get('[data-testid="new-request-button"]').click();
    cy.url().should("include", "/requests/new");

    cy.get('[data-testid="request-type-select"]').should("contain", "Anticipo");
    selectOption("request-month-select", "Junio");

    cy.get('[data-testid="request-planning-line-trigger"]', { timeout: 15000 })
      .should("not.be.disabled")
      .click();
    cy.get('[data-testid="request-planning-line-trigger-option"]', { timeout: 15000 })
      .first()
      .click();

    cy.get('[data-testid="request-amount-input"]').clear().type("100");
    cy.get('[data-testid="request-concept-input"]').clear().type(marker);
    cy.get('[data-testid="request-use-my-data-button"]').click();
    selectOption("request-bank-select", "Banco de Crédito del Perú");
    selectOption("request-account-type-select", "Ahorros");
    cy.get('[data-testid="request-bank-account-input"]').clear().type("1912345678901");
    cy.get('[data-testid="request-bank-cci-input"]').clear().type("00219100123456789012");

    cy.get('[data-testid="request-save-draft-button"]').click();
    cy.contains("Borrador guardado", { timeout: 15000 }).should("be.visible");

    cy.visit("/requests");
    cy.get('[data-testid="requests-search-input"]', { timeout: 12000 }).clear().type(marker);
    cy.contains("Cargando solicitudes...").should("not.exist");
    cy.get('[data-testid="request-list-row"]', { timeout: 15000 })
      .should("have.length.at.least", 1)
      .first()
      .within(() => {
        cy.contains("Borrador").should("be.visible");
        cy.get('[data-testid="request-edit-link"]').should("contain", "Editar");
        cy.get('[data-testid="request-detail-link"]').should("contain", "Ver");
        cy.get('[data-testid="request-detail-link"]').click();
      });

    cy.contains(marker, { timeout: 15000 }).should("be.visible");
    cy.contains("Borrador editable").should("be.visible");
    cy.contains("Editar borrador").click();
    cy.url().should("include", "/edit");
    cy.get('[data-testid="request-concept-input"]', { timeout: 12000 }).should("have.value", marker);
  });
});
