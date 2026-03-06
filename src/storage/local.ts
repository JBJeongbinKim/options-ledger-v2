import { createInitialLedgerState, type LedgerState } from "../domain/ledger";

const STORAGE_KEY = "options-ledger-v2.state";
const RESET_NAV_KEY = "options-ledger-v2.reset-nav";

export function loadResetNavPoints(): number | undefined {
  const raw = window.localStorage.getItem(RESET_NAV_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function saveResetNavPoints(points: number): void {
  window.localStorage.setItem(RESET_NAV_KEY, String(points));
}

export function loadLedgerState(): LedgerState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialLedgerState(loadResetNavPoints());

  try {
    const parsed = JSON.parse(raw) as LedgerState;
    return {
      startingNavPoints: parsed.startingNavPoints,
      cashPoints: parsed.cashPoints,
      openPositions: parsed.openPositions ?? [],
      realizedTodayPoints: parsed.realizedTodayPoints ?? 0,
      realizedWeekPoints: parsed.realizedWeekPoints ?? 0,
    };
  } catch {
    return createInitialLedgerState(loadResetNavPoints());
  }
}

export function saveLedgerState(state: LedgerState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
