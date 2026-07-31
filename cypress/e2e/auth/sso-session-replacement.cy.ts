export {};

const API_PATTERN = "**/auth/sso?token=*";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorBody(code: string, statusCode = 409) {
  return {
    statusCode,
    code,
    message: code,
    error: statusCode === 401 ? "Unauthorized" : "Conflict",
    timestamp: new Date().toISOString(),
    path: "/auth/sso",
  };
}

function assertTokenWasRemoved(token: string) {
  cy.location("pathname").should("eq", "/login");
  cy.location("search").should("eq", "");
  cy.window().then((win) => {
    expect(win.location.href).not.to.contain(token);
    expect(JSON.stringify(win.history.state ?? {})).not.to.contain(token);
  });
}

describe("SSO session replacement — browser contract", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.setCookie("refresh_token", "synthetic-session-a", {
      path: "/auth/",
      httpOnly: true,
      sameSite: "strict",
    });
  });

  it("reemplaza A por B una sola vez, sin prelogout y sin dejar el handoff en history", () => {
    let exchangeCalls = 0;
    let logoutCalls = 0;

    cy.task<string>("signTestJwt", {
      sub: "synthetic-session-b",
      role: "EMPLEADO_EPE",
    }).then((accessToken) => {
      cy.intercept("POST", "**/auth/logout", (request) => {
        logoutCalls += 1;
        request.reply({ statusCode: 204 });
      });
      cy.intercept("GET", "/onboarding", {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: "<!doctype html><html><body>synthetic onboarding destination</body></html>",
      });
      cy.intercept("GET", API_PATTERN, (request) => {
        exchangeCalls += 1;
        expect(request.headers["idempotency-key"]).to.match(UUID_V4);
        expect(request.headers["x-request-id"]).to.match(UUID_V4);
        request.reply({
          statusCode: 200,
          delay: 750,
          headers: {
            "Set-Cookie": "refresh_token=synthetic-session-b; Path=/auth/; HttpOnly; SameSite=Strict",
          },
          body: {
            data: {
              accessToken,
              accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
              sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
              onboardingRequired: true,
              user: {
                id: "synthetic-session-b",
                firstName: "Session",
                lastName: "B",
                email: "b@example.test",
                epeDni: "99999999",
                onboardingCompleted: false,
                authSource: "EPE",
                roles: [{ code: "EMPLEADO_EPE", name: "Empleado EPE" }],
              },
            },
          },
        });
      }).as("ssoSuccess");

      cy.visit("/login?token=synthetic-valid-handoff");
      cy.wait("@ssoSuccess");
      cy.url({ timeout: 10_000 }).should("include", "/onboarding");
      cy.getCookie("access_token").its("value").should("eq", accessToken);
      cy.getCookie("refresh_token").its("value").should("eq", "synthetic-session-b");
      cy.window().then((win) => {
        expect(win.location.href).not.to.contain("synthetic-valid-handoff");
        expect(JSON.stringify(win.history.state ?? {})).not.to.contain("synthetic-valid-handoff");
      });
      cy.then(() => {
        expect(exchangeCalls).to.eq(1);
        expect(logoutCalls).to.eq(0);
      });
    });
  });

  for (const code of ["SSO_INVALID", "SSO_EXPIRED", "SSO_REPLAY"] as const) {
    it(`${code} conserva A y habilita login manual sin refresh`, () => {
      cy.intercept("GET", API_PATTERN, {
        statusCode: code === "SSO_INVALID" ? 401 : 409,
        body: errorBody(code, code === "SSO_INVALID" ? 401 : 409),
      }).as("ssoRejected");
      cy.intercept("POST", "**/auth/login", {
        statusCode: 401,
        body: errorBody("MANUAL_INVALID", 401),
      }).as("manualLogin");
      cy.intercept("POST", "**/auth/logout").as("logout");

      const token = `synthetic-${code.toLowerCase()}`;
      cy.visit(`/login?token=${token}`);
      cy.wait("@ssoRejected");
      assertTokenWasRemoved(token);
      cy.getCookie("refresh_token").its("value").should("eq", "synthetic-session-a");

      cy.get('input[autocomplete="username"]').type("12345678");
      cy.get('input[autocomplete="current-password"]').type("manual-password");
      cy.get('button[type="submit"]').should("be.enabled").click();
      cy.wait("@manualLogin");
      cy.get("@logout.all").should("have.length", 0);
    });
  }

  it("reintenta SSO_BUSY según Retry-After con la misma clave", () => {
    const idempotencyKeys: string[] = [];
    const requestIds: string[] = [];
    let calls = 0;
    cy.intercept("GET", API_PATTERN, (request) => {
      calls += 1;
      idempotencyKeys.push(String(request.headers["idempotency-key"]));
      requestIds.push(String(request.headers["x-request-id"]));
      request.reply({
        statusCode: 409,
        headers: { "Retry-After": "0" },
        body: errorBody("SSO_BUSY"),
      });
    }).as("busy");

    cy.visit("/login?token=synthetic-busy");
    cy.wait("@busy");
    cy.wait("@busy");
    cy.contains("El acceso ya se está procesando.").should("be.visible");
    assertTokenWasRemoved("synthetic-busy");
    cy.then(() => {
      expect(calls).to.eq(2);
      expect(new Set(idempotencyKeys).size).to.eq(1);
      expect(new Set(requestIds).size).to.eq(1);
    });
  });

  it("un fallo de red entre etapas es no destructivo y recuperable", () => {
    let calls = 0;
    const idempotencyKeys: string[] = [];
    cy.intercept("GET", API_PATTERN, (request) => {
      calls += 1;
      idempotencyKeys.push(String(request.headers["idempotency-key"]));
      request.reply({
        statusCode: 503,
        body: errorBody("SSO_UPSTREAM_UNAVAILABLE", 503),
      });
    }).as("offline");

    cy.visit("/login?token=synthetic-offline");
    cy.wait("@offline");
    cy.wait("@offline");
    cy.contains("Error al procesar el acceso automático. Tu sesión anterior se conserva").should("be.visible");
    cy.get('button[type="submit"]').should("be.enabled");
    cy.getCookie("refresh_token").its("value").should("eq", "synthetic-session-a");
    assertTokenWasRemoved("synthetic-offline");
    cy.then(() => {
      expect(calls).to.eq(2);
      expect(new Set(idempotencyKeys).size).to.eq(1);
    });
  });
});
