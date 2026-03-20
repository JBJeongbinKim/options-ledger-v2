import {
  addTrade,
  applyKospiIntrinsicAll,
  buildDashboard,
  closePosition,
  createInitialLedgerState,
  getDefaultUnderlying,
  updateOpenPosition,
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


  test("updating position key merges into existing open position", () => {
    let state = createInitialLedgerState();
    state = addTrade(state, { underlying: "Thu", type: "Call", strike: 350, qty: 1, price: 1.0 });
    state = addTrade(state, { underlying: "Mon", type: "Put", strike: 360, qty: 2, price: 1.2 });

    const source = state.openPositions.find((position) => position.underlying === "Thu")!;
    const next = updateOpenPosition(state, source.id, {
      underlying: "Mon",
      type: "Put",
      strike: 360,
      currentPrice: 1.5,
    });

    expect(next.openPositions).toHaveLength(1);
    expect(next.openPositions[0].underlying).toBe("Mon");
    expect(next.openPositions[0].type).toBe("Put");
    expect(next.openPositions[0].strike).toBe(360);
    expect(next.openPositions[0].qty).toBe(3);
    expect(next.openPositions[0].currentPrice).toBe(1.5);
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
    expect(next.realizedEvents).toHaveLength(1);
    expect(next.realizedEvents[0].points).toBeCloseTo(0.49, 6);
  });

  test("buildDashboard calculates daily and weekly realized P&L in Eastern time", () => {
    let state = addTrade(createInitialLedgerState(), {
      underlying: "Thu",
      type: "Call",
      strike: 350,
      qty: 3,
      price: 1,
    });
    const positionId = state.openPositions[0].id;

    state = closePosition(state, positionId, 1, 1.5, new Date("2026-03-16T03:30:00.000Z"));
    state = closePosition(state, positionId, 1, 1.6, new Date("2026-03-16T05:30:00.000Z"));
    state = closePosition(state, positionId, 1, 1.4, new Date("2026-03-22T23:30:00.000Z"));

    const dashboard = buildDashboard(state, new Date("2026-03-22T23:45:00.000Z"));

    expect(dashboard.realizedDayPoints).toBeCloseTo(0.3904, 6);
    expect(dashboard.realizedWeekPoints).toBeCloseTo(0.98, 6);
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

  test("sorts open positions by underlying, type, and strike", () => {
    let state = createInitialLedgerState();
    state = addTrade(state, { underlying: "Thu", type: "Call", strike: 350, qty: 1, price: 1 });
    state = addTrade(state, { underlying: "Mon", type: "Call", strike: 355, qty: 1, price: 1 });
    state = addTrade(state, { underlying: "Mon", type: "Put", strike: 340, qty: 1, price: 1 });
    state = addTrade(state, { underlying: "Mon", type: "Put", strike: 360, qty: 1, price: 1 });
    state = addTrade(state, { underlying: "Mon", type: "Call", strike: 345, qty: 1, price: 1 });
    state = addTrade(state, { underlying: "Month", type: "Put", strike: 330, qty: 1, price: 1 });

    const labels = state.openPositions.map((position) => `${position.underlying}-${position.type}-${position.strike}`);

    expect(labels).toEqual([
      "Mon-Call-345",
      "Mon-Call-355",
      "Mon-Put-360",
      "Mon-Put-340",
      "Thu-Call-350",
      "Month-Put-330",
    ]);
  });
  test("default underlying is Mon after Thu 3AM through before Mon 3AM, otherwise Thu", () => {
    expect(getDefaultUnderlying(new Date("2026-03-06T12:00:00"))).toBe("Mon");
    expect(getDefaultUnderlying(new Date("2026-03-10T12:00:00"))).toBe("Thu");
    expect(getDefaultUnderlying(new Date("2026-03-05T02:30:00"))).toBe("Thu");
    expect(getDefaultUnderlying(new Date("2026-03-05T04:00:00"))).toBe("Mon");
  });
});




