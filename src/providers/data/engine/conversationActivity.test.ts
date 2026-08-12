import { describe, expect, it } from "vitest";
import { deriveActivityDelta } from "./conversationActivity";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("deriveActivityDelta", () => {
  it("INSERT (before=null) is a 'created' event carrying the initial status/owner", () => {
    expect(
      deriveActivityDelta(null, { status: "aguardando", assignedSellerId: null }, null),
    ).toEqual({
      type: "created",
      fromStatus: null,
      toStatus: "aguardando",
      fromSellerId: null,
      toSellerId: null,
    });
  });

  it("returns null when neither status nor owner changed", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "em_andamento", assignedSellerId: A },
        A,
      ),
    ).toBeNull();
  });

  it("close = one 'status' row carrying both the terminal status and the owner drop", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "resolvida", assignedSellerId: null },
        A,
      ),
    ).toEqual({
      type: "status",
      fromStatus: "em_andamento",
      toStatus: "resolvida",
      fromSellerId: A,
      toSellerId: null,
    });
  });

  it("system re-queue of a terminal is a 'reopen'", () => {
    expect(
      deriveActivityDelta(
        { status: "resolvida", assignedSellerId: null },
        { status: "aguardando", assignedSellerId: null },
        null,
      ),
    ).toMatchObject({ type: "reopen", fromStatus: "resolvida", toStatus: "aguardando" });
  });

  it("a seller manually reopening a terminal is NOT a system reopen (type 'status')", () => {
    expect(
      deriveActivityDelta(
        { status: "resolvida", assignedSellerId: null },
        { status: "aguardando", assignedSellerId: null },
        A,
      ),
    ).toMatchObject({ type: "status" });
  });

  it("owner-only change (transfer) is an 'assignment'", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "em_andamento", assignedSellerId: B },
        A,
      ),
    ).toEqual({
      type: "assignment",
      fromStatus: null,
      toStatus: null,
      fromSellerId: A,
      toSellerId: B,
    });
  });
});
