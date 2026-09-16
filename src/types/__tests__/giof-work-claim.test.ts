import { describe, expect, expectTypeOf, it } from "vitest";

import {
  GIOF_CLAIMABLE_ASSIGNMENT_STATE,
  GIOF_CLAIMABLE_LEASE_STATE,
  GIOF_OWNERSHIP_ERROR_CODE,
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  GIOF_WORK_POOL,
  type GiofClaimableWorkPage,
  type GiofSelfClaimCommand,
  type GiofSelfClaimResult,
  type GiofForceReassignWorkCommand,
  type GiofReleaseWorkCommand,
  type GiofWorkMetadata,
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

  it("representa el read model público y los comandos mínimos sin credenciales de lease", () => {
    expect(Object.values(GIOF_WORK_ASSIGNMENT_STATE)).toEqual([
      "UNASSIGNED",
      "SELF",
      "OTHER",
    ]);
    expect(Object.values(GIOF_WORK_LEASE_STATE)).toEqual([
      "NONE",
      "ACTIVE_SELF",
      "ACTIVE_OTHER",
      "EXPIRED",
      "STALE",
    ]);
    expect(Object.values(GIOF_OWNERSHIP_ERROR_CODE)).toContain(
      "ACTIVE_CROSS_POOL_LEASE",
    );
    expectTypeOf<GiofReleaseWorkCommand>().toEqualTypeOf<{
      requestId: string;
      pool: GiofWorkPool;
      expectedAssignmentVersion: number;
    }>();
    expectTypeOf<GiofForceReassignWorkCommand>().not.toHaveProperty("token");
    expectTypeOf<GiofForceReassignWorkCommand>().not.toHaveProperty(
      "leaseFingerprint",
    );
    expectTypeOf<GiofWorkMetadata>().toHaveProperty("assignmentState");
    expectTypeOf<GiofWorkMetadata>().toHaveProperty("leaseState");
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
