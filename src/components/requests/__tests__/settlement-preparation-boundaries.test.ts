import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settlement preparation boundaries", () => {
  it("mantiene RequestStatusStepper desacoplado del rollout de preparación REXAN", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/requests/request-status-stepper.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/feature-flags|settlement-preparation/i);
  });
});
