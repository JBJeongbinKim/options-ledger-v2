import {
  addTrade,
  buildDashboard,
  createInitialLedgerState,
  getDefaultUnderlying,
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

  test("add trade creates open position and keeps NAV stable at entry", () => {
    const base = createInitialLedgerState();
    const next = addTrade(
      base,
      {
        underlying: "Thu",
        type: "Call",
        strike: 350,
        qty: 1,
        price: 1.25,
      },
      new Date("2026-03-05T12:00:00.000Z"),
    );
    const dashboard = buildDashboard(next);

    expect(next.openPositions).toHaveLength(1);
    expect(next.cashPoints).toBe(15.75);
    expect(dashboard.unrealizedPoints).toBe(0);
    expect(dashboard.navPoints).toBe(17);
  });

  test("default underlying follows Thu 3 AM to Mon 3 AM rule", () => {
    expect(getDefaultUnderlying(new Date("2026-03-06T12:00:00"))).toBe("Mon");
    expect(getDefaultUnderlying(new Date("2026-03-05T02:30:00"))).toBe("Mon");
    expect(getDefaultUnderlying(new Date("2026-03-05T04:00:00"))).toBe("Thu");
  });
});
