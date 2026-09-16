import { describe, expect, expectTypeOf, it } from "vitest";

import {
  GIOF_CLAIMABLE_ASSIGNMENT_STATE,
  GIOF_CLAIMABLE_LEASE_STATE,
  GIOF_WORK_POOL,
  type GiofClaimableWorkPage,
  type GiofSelfClaimCommand,
  type GiofSelfClaimResult,
  type GiofWorkPool,
} from "@/types/giof-work";

describe("contratos frontend de autoasignación GIOF", () => {
  it("mantiene pools y estados como contratos explícitos derivados de constantes", () => {
    expect(Object.values(GIOF_WORK_POOL)).toEqual([
      "REQUEST",
      "PAYMENT",
      "REXAN",
    ]);
    expect(Object.values(GIOF_CLAIMABLE_ASSIGNMENT_STATE)).toEqual([
      "OWN",
      "UNASSIGNED",
      "TAKEOVER",
    ]);
    expect(Object.values(GIOF_CLAIMABLE_LEASE_STATE)).toEqual([
      "NONE",
      "OWN_ACTIVE",
      "EXPIRED",
      "STALE",
    ]);
    expectTypeOf<GiofWorkPool>().toEqualTypeOf<
      "REQUEST" | "PAYMENT" | "REXAN"
    >();
  });

  it("separa comando, respuesta y página mínima de los contratos admin/bulk", () => {
    expectTypeOf<GiofSelfClaimCommand>().toEqualTypeOf<{
      pool: GiofWorkPool;
      requestId: string;
      expectedVersion: number;
    }>();
    expectTypeOf<GiofSelfClaimResult>().toMatchTypeOf<{
      requestId: string;
      pool: GiofWorkPool;
      assignmentVersion: string;
      changed: boolean;
    }>();
    expectTypeOf<GiofClaimableWorkPage>().toHaveProperty("items");
    expectTypeOf<GiofClaimableWorkPage["items"][number]>().not.toHaveProperty(
      "assigneeId",
    );
    expectTypeOf<GiofClaimableWorkPage["items"][number]>().not.toHaveProperty(
      "assigneeName",
    );
  });
});
