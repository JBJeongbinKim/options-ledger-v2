import { buildDashboard, createInitialLedgerState } from "../domain/ledger";
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
});
