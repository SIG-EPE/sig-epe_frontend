export {};

const API_URL = "http://localhost:3001";
const REQUEST_TARGET = "/requests/request-123?mode=process&tab=history";

interface TestJwtInput {
  role?: string;
  scope?: "full" | "onboarding";
}

function installSession(input: TestJwtInput = {}): Cypress.Chainable<string> {
  return cy.task<string>("signTestJwt", input).then((token) => {
    cy.setCookie("access_token", token);
    return cy.wrap(token, { log: false });
  });
}

function stubMe(onboardingCompleted = true): void {
  cy.intercept("GET", `${API_URL}/auth/me`, {
    statusCode: 200,
    body: {
      data: {
        id: "user-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: onboardingCompleted ? "ada@example.com" : null,
        epeDni: "12345678",
        onboardingCompleted,
        authSource: "LOCAL",
        roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
      },
    },
  }).as("me");
}

describe("Authentication return navigation", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("captures a protected notification target and preserves it after password login", () => {
    cy.task<string>("signTestJwt", { role: "SOLICITANTE_EPE" }).then((token) => {
      cy.intercept("POST", `${API_URL}/auth/login`, {
        statusCode: 200,
        body: {
          data: {
            accessToken: token,
            onboardingRequired: false,
            user: {
              id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@example.com",
              epeDni: "12345678",
              onboardingCompleted: true,
              authSource: "LOCAL",
              roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
            },
          },
        },
      }).as("login");
      cy.intercept("GET", `${API_URL}/requests/request-123`, {
        statusCode: 404,
        body: { statusCode: 404, message: "Not found" },
      });

      cy.visit(REQUEST_TARGET);
      cy.location("pathname").should("eq", "/login");
      cy.location("search").should("contain", "returnTo=");
      cy.get('input[autocomplete="username"]').type("12345678");
      cy.get('input[autocomplete="current-password"]').type("Password123");
      cy.get('button[type="submit"]').click();
      cy.wait("@login");
      cy.location("pathname", { timeout: 10000 }).should("eq", "/requests/request-123");
      cy.location("search").should("eq", "?mode=process&tab=history");
    });
  });

  it("cleans SSO token and arbitrary fields while preserving safe intent", () => {
    cy.intercept("GET", `${API_URL}/auth/sso?token=handoff`, {
      statusCode: 401,
      body: { statusCode: 401, message: "Invalid", error: "Unauthorized" },
    }).as("sso");

    cy.visit(
      "/login?token=handoff&returnTo=%2Frequests%2Frequest-123%3Fmode%3Dprocess&reason=inactividad&extra=secret",
    );
    cy.wait("@sso");
    cy.location("search").should(
      "eq",
      "?returnTo=%2Frequests%2Frequest-123%3Fmode%3Dprocess&reason=inactividad",
    );
    cy.location("search").should("not.contain", "token").and("not.contain", "extra");
  });

  it("carries intent through required onboarding and consumes it after completion", () => {
    cy.task<string>("signTestJwt", { role: "SOLICITANTE_EPE", scope: "onboarding" }).then(
      (onboardingToken) => {
        cy.setCookie("access_token", onboardingToken);
        stubMe(false);
        cy.task<string>("signTestJwt", { role: "SOLICITANTE_EPE", scope: "full" }).then(
          (fullToken) => {
            cy.intercept("POST", `${API_URL}/auth/onboarding`, {
              statusCode: 200,
              body: {
                data: {
                  accessToken: fullToken,
                  onboardingRequired: false,
                  user: {
                    id: "user-1",
                    firstName: "Ada",
                    lastName: "Lovelace",
                    email: "ada@example.com",
                    epeDni: "12345678",
                    onboardingCompleted: true,
                    authSource: "LOCAL",
                    roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
                  },
                },
              },
            }).as("onboarding");
            cy.intercept("GET", `${API_URL}/requests/request-123`, {
              statusCode: 404,
              body: { statusCode: 404, message: "Not found" },
            });

            cy.visit(`/onboarding?returnTo=${encodeURIComponent(REQUEST_TARGET)}`);
            cy.get('input[autocomplete="email"]').type("ada@example.com");
            cy.get('input[autocomplete="new-password"]').first().type("Password123");
            cy.get('input[autocomplete="new-password"]').last().type("Password123");
            cy.get('button[type="submit"]').click();
            cy.wait("@onboarding");
            cy.location("pathname", { timeout: 10000 }).should("eq", "/requests/request-123");
            cy.location("search").should("eq", "?mode=process&tab=history");
          },
        );
      },
    );
  });

  it("preserves the current deep link on automatic expiry", () => {
    cy.clock();
    installSession();
    stubMe();
    cy.intercept("POST", `${API_URL}/auth/logout`, { statusCode: 204 }).as("logout");
    cy.intercept("GET", `${API_URL}/requests/request-123`, {
      statusCode: 404,
      body: { statusCode: 404, message: "Not found" },
    });
    cy.visit(REQUEST_TARGET);

    cy.tick(120 * 60 * 1000);
    cy.wait("@logout");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
    cy.location("search").should("contain", "reason=inactividad");
    cy.location("search").should("contain", "returnTo=");
  });

  it("allows an authenticated direct deep link and renders safe 403/404 detail states", () => {
    installSession();
    stubMe();
    cy.intercept("GET", `${API_URL}/requests/request-123`, {
      statusCode: 403,
      body: { statusCode: 403, message: "sensitive resource detail" },
    }).as("forbidden");
    cy.visit(REQUEST_TARGET);
    cy.wait("@forbidden");
    cy.location("pathname").should("eq", "/requests/request-123");
    cy.contains("No tienes acceso a esta solicitud.").should("be.visible");
    cy.contains("sensitive resource detail").should("not.exist");

    cy.intercept("GET", `${API_URL}/requests/request-123`, {
      statusCode: 404,
      body: { statusCode: 404, message: "deleted resource detail" },
    }).as("missing");
    cy.reload();
    cy.wait("@missing");
    cy.contains("La solicitud no existe o ya no está disponible.").should("be.visible");
    cy.contains("Volver a solicitudes").should("be.visible");
  });

  it("rejects malicious intent and preserves no-target legacy login", () => {
    cy.visit("/login?returnTo=%2F%2Fevil.test");
    cy.location("pathname").should("eq", "/login");
    cy.location("search").should("eq", "?returnTo=%2F%2Fevil.test");

    cy.visit("/login");
    cy.location("pathname").should("eq", "/login");
    cy.location("search").should("eq", "");
    cy.get('button[type="submit"]').should("contain.text", "Ingresar");
  });
});
