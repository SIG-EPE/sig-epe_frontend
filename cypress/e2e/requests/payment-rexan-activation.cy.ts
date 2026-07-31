// Aceptación opt-in sobre fixtures browser persistidos y documentados.
export {};

const reusedRequestId = String(Cypress.env("rexanReusedRequestId") ?? "");
const historicalRequestId = String(Cypress.env("rexanHistoricalRequestId") ?? "");
const failedRequestId = String(Cypress.env("rexanFailedRequestId") ?? "");

function loginAsGiof(): void {
  cy.login(
    String(Cypress.env("giofDni") ?? ""),
    String(Cypress.env("giofPassword") ?? ""),
  );
}

function loginAsRequester(): void {
  cy.login(
    String(Cypress.env("requesterDni") ?? ""),
    String(Cypress.env("requesterPassword") ?? ""),
  );
}

describe("Pago y activación REXAN durable", () => {
  before(function () {
    if (!reusedRequestId || !historicalRequestId || !failedRequestId) this.skip();
  });

  it("conserva REUSED moderno tras refresh, enlaza la REXAN y no ofrece segundo pago", () => {
    loginAsGiof();
    cy.visit(`/requests/${reusedRequestId}`);
    cy.get('[data-testid="rexan-activation-state-card"]', { timeout: 15_000 }).should("be.visible");
    cy.get('[data-testid="rexan-activation-state-card"]').should("contain.text", "REXAN reutilizada");
    cy.get('[data-testid="register-payment-button"]').should("not.exist");
    cy.contains("Abrir REXAN").should("have.attr", "href").and("match", /^\/requests\//);
    cy.reload();
    cy.get('[data-testid="rexan-activation-state-card"]').should("contain.text", "REXAN reutilizada");
  });

  it("mapea outcome histórico nulo a CREATED tras refresh", () => {
    loginAsGiof();
    cy.visit(`/requests/${historicalRequestId}`);
    cy.get('[data-testid="rexan-activation-state-card"]', { timeout: 15_000 }).should("contain.text", "REXAN activada");
    cy.reload();
    cy.get('[data-testid="rexan-activation-state-card"]').should("contain.text", "REXAN activada");
    cy.get('[data-testid="register-payment-button"]').should("not.exist");
  });

  it("expone retry FAILED al GIOF", () => {
    loginAsGiof();
    cy.visit(`/requests/${failedRequestId}`);
    cy.get('[data-testid="rexan-activation-state-card"]', { timeout: 15_000 }).should("contain.text", "REXAN requiere atención");
    cy.get('[data-testid="retry-rexan-button"]').should("be.visible");
    cy.get('[data-testid="register-payment-button"]').should("not.exist");
  });

  it("oculta retry FAILED al solicitante", () => {
    loginAsRequester();
    cy.visit(`/requests/${failedRequestId}`);
    cy.get('[data-testid="rexan-activation-state-card"]', { timeout: 15_000 }).should("contain.text", "REXAN requiere atención");
    cy.get('[data-testid="retry-rexan-button"]').should("not.exist");
    cy.get('[data-testid="register-payment-button"]').should("not.exist");
  });
});
