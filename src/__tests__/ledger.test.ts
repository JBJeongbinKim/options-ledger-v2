import {
  addTrade,
  applyKospiIntrinsicAll,
  buildDashboard,
  closePosition,
  createInitialLedgerState,
  getDefaultUnderlying,
  updatePositionPrice,
} from "../domain/ledger";
import { formatKrwFromPoints, formatPoints } from "../domain/format";

describe("ledger domain", () => {
  test("default first open NAV is 17.00 points", () => {
    const state = createInitialLedgerState();
    const dashboard = buildDashboard(state);

    expect(dashboard.navPoints).toBe(17);
    expect(formatPoints(dashboard.navPoints)).toBe("17.00");
    expect(formatKrwFromPoints(dashboard.navPoints)).toBe("\u20A94,250,000");
  });

  test("reset NAV value is respected on next initial state", () => {
    const state = createInitialLedgerState(22.5);
    const dashboard = buildDashboard(state);

    expect(dashboard.navPoints).toBe(22.5);
    expect(formatPoints(dashboard.navPoints)).toBe("22.50");
    expect(formatKrwFromPoints(dashboard.navPoints)).toBe("\u20A95,625,000");
  });

  test("add trade merges same option into one line with weighted avg cost", () => {
    let state = createInitialLedgerState();
    state = addTrade(state, { underlying: "Thu", type: "Call", strike: 350, qty: 1, price: 1.0 });
    state = addTrade(state, { underlying: "Thu", type: "Call", strike: 350, qty: 3, price: 1.5 });

    expect(state.openPositions).toHaveLength(1);
    expect(state.openPositions[0].qty).toBe(4);
    expect(state.openPositions[0].entryPrice).toBe(1.375);
  });

  test("buy fee reduces NAV at entry", () => {
    const state = addTrade(createInitialLedgerState(), {
      underlying: "Thu",
      type: "Call",
      strike: 350,
      qty: 1,
      price: 1,
    });
    const dashboard = buildDashboard(state);

    expect(dashboard.navPoints).toBeCloseTo(16.996, 6);
  });

  test("update position includes entry fee in unrealized", () => {
    const base = addTrade(createInitialLedgerState(), {
      underlying: "Thu",
      type: "Call",
      strike: 350,
      qty: 1,
      price: 1,
    });
    const positionId = base.openPositions[0].id;
    const next = updatePositionPrice(base, positionId, 1.5, new Date("2026-03-05T12:00:00.000Z"));
    const dashboard = buildDashboard(next);

    expect(dashboard.unrealizedPoints).toBeCloseTo(0.496, 6);
  });

  test("partial close applies buy/sell fees to realized", () => {
    const base = addTrade(createInitialLedgerState(), {
      underlying: "Thu",
      type: "Call",
      strike: 350,
      qty: 2,
      price: 1,
    });
    const positionId = base.openPositions[0].id;
    const next = closePosition(base, positionId, 1, 1.5, new Date("2026-03-05T12:00:00.000Z"));

    expect(next.cashPoints).toBeCloseTo(16.486, 6);
    expect(next.realizedTodayPoints).toBeCloseTo(0.49, 6);
    expect(next.realizedWeekPoints).toBeCloseTo(0.49, 6);
  });

  test("apply-all sets intrinsic value to call and put", () => {
    let state = addTrade(createInitialLedgerState(), {
      underlying: "Thu",
      type: "Call",
      strike: 350,
      qty: 1,
      price: 1,
    });
    state = addTrade(state, {
      underlying: "Thu",
      type: "Put",
      strike: 340,
      qty: 1,
      price: 1,
    });

    const next = applyKospiIntrinsicAll(state, 345, new Date("2026-03-05T12:00:00.000Z"));
    const call = next.openPositions.find((position) => position.type === "Call");
    const put = next.openPositions.find((position) => position.type === "Put");

    expect(call?.currentPrice).toBe(0);
    expect(put?.currentPrice).toBe(0);

    const next2 = applyKospiIntrinsicAll(next, 360, new Date("2026-03-05T12:10:00.000Z"));
    const call2 = next2.openPositions.find((position) => position.type === "Call");
    const put2 = next2.openPositions.find((position) => position.type === "Put");

    expect(call2?.currentPrice).toBe(10);
    expect(put2?.currentPrice).toBe(0);
  });

  test("default underlying is Thu between Thu 3AM and Mon 3AM, otherwise Mon", () => {
    expect(getDefaultUnderlying(new Date("2026-03-06T12:00:00"))).toBe("Thu");
    expect(getDefaultUnderlying(new Date("2026-03-10T12:00:00"))).toBe("Mon");
    expect(getDefaultUnderlying(new Date("2026-03-05T02:30:00"))).toBe("Mon");
    expect(getDefaultUnderlying(new Date("2026-03-05T04:00:00"))).toBe("Thu");
  });
});
