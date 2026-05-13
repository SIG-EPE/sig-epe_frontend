// cypress/support/commands.ts
// Comandos Cypress compartidos

interface AuthLoginPayload {
  accessToken: string;
}

interface ApiResponseEnvelope<T> {
  data: T;
}

function resolveApiUrl(apiUrl: unknown): string {
  if (typeof apiUrl === "string" && apiUrl.trim().length > 0) {
    return apiUrl;
  }

  return "http://localhost:3001";
}

function readEnv(name: string): unknown {
  return Cypress.env(name) ?? Cypress.env(name.toLowerCase());
}

function getLoginPayload(body: AuthLoginPayload | ApiResponseEnvelope<AuthLoginPayload>): AuthLoginPayload {
  if ("accessToken" in body) {
    return body;
  }

  return body.data;
}

declare global {
  namespace Cypress {
    interface Chainable {
      login(dni: string, password: string): Chainable<void>
      loginByApi(dni: string, password: string): Chainable<AuthLoginPayload>
    }
  }
}

Cypress.Commands.add("loginByApi", (dni: string, password: string) => {
  return cy.request<AuthLoginPayload | ApiResponseEnvelope<AuthLoginPayload>>("POST", `${resolveApiUrl(readEnv("apiUrl"))}/auth/login`, {
    identifier: dni,
    password,
  }).then((response) => {
    const payload = getLoginPayload(response.body);
    return cy.setCookie("access_token", payload.accessToken).then(() => payload);
  });
});

Cypress.Commands.add("login", (dni: string, password: string) => {
  cy.loginByApi(dni, password).then(() => undefined);
});

export {}
