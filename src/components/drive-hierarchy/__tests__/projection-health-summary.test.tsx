import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectionHealthSummary } from "../projection-health-summary";

describe("ProjectionHealthSummary", () => {
  it.each([
    ["PASS", "Auditor saludable"],
    ["STALE", "Auditor vencido"],
    ["FAIL", "Auditor bloqueado"],
  ] as const)("shows %s automatic auditor health", (status, label) => {
    render(
      <ProjectionHealthSummary
        auditor={{
          status,
          generation: 12,
          rootRevision: "7",
          observedAt: "2026-08-25T10:00:00.000Z",
          expiresAt: "2026-08-25T10:15:00.000Z",
          ageSeconds: 30,
          issueCodes: status === "PASS" ? [] : ["AUDITOR_SNAPSHOT_STALE"],
          auditedCount: 25,
          frozenCount: status === "FAIL" ? 1 : 0,
          wireAttempts: 26,
        }}
        callBudget={{ normal: 1, maximum: 2, lastBatchMaximum: 2 }}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(/1 normal · 2 máximo/i)).toBeInTheDocument();
  });
});
