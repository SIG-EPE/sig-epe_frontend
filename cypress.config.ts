import { defineConfig } from "cypress";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface SignTestJwtInput {
  sub?: string;
  role?: string;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function readEnvFileSecret(fileName: string): string | null {
  const filePath = join(__dirname, fileName);
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf8");
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith("JWT_ACCESS_SECRET="));
  if (!line) return null;

  const rawValue = line.slice(line.indexOf("=") + 1).trim();
  return rawValue.replace(/^['"]|['"]$/g, "") || null;
}

function resolveJwtAccessSecret(): string {
  return process.env.JWT_ACCESS_SECRET
    ?? readEnvFileSecret(".env.local")
    ?? readEnvFileSecret(".env")
    ?? "undefined";
}

function signTestJwt(input: SignTestJwtInput): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    sub: input.sub ?? "cypress-user",
    role: input.role ?? "SOLICITANTE_EPE",
    scope: "full",
    iat: now,
    exp: now + 60 * 60,
  });
  const signature = createHmac("sha256", resolveJwtAccessSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export default defineConfig({
  env: {
    apiUrl: process.env.CYPRESS_apiUrl,
    giofDni: process.env.CYPRESS_giofDni,
    giofPassword: process.env.CYPRESS_giofPassword,
    requesterDni: process.env.CYPRESS_requesterDni,
    requesterPassword: process.env.CYPRESS_requesterPassword,
    rexanReusedRequestId: process.env.CYPRESS_rexanReusedRequestId,
    rexanHistoricalRequestId: process.env.CYPRESS_rexanHistoricalRequestId,
    rexanFailedRequestId: process.env.CYPRESS_rexanFailedRequestId,
  },
  e2e: {
    baseUrl: "http://localhost:3000",
    setupNodeEvents(on, _config) {
      on("task", {
        signTestJwt(input: SignTestJwtInput) {
          return signTestJwt(input);
        },
      });
    },
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
  },
});
