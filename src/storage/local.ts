import {
  createInitialLedgerState,
  normalizeOpenPositions,
  type LedgerState,
} from "../domain/ledger";

const STORAGE_KEY = "options-ledger-v2.state";
const RESET_NAV_KEY = "options-ledger-v2.reset-nav";
const KOSPI_KEY = "options-ledger-v2.kospi200";

export function loadResetNavPoints(): number | undefined {
  const raw = window.localStorage.getItem(RESET_NAV_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function saveResetNavPoints(points: number): void {
  window.localStorage.setItem(RESET_NAV_KEY, String(points));
}

export function loadKospi200Value(): number | undefined {
  const raw = window.localStorage.getItem(KOSPI_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function saveKospi200Value(value: number): void {
  window.localStorage.setItem(KOSPI_KEY, String(value));
}

export function loadLedgerState(): LedgerState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialLedgerState(loadResetNavPoints());

  try {
    const parsed = JSON.parse(raw) as LedgerState;
    return {
      startingNavPoints: parsed.startingNavPoints,
      cashPoints: parsed.cashPoints,
      openPositions: normalizeOpenPositions(parsed.openPositions ?? []),
      realizedTodayPoints: parsed.realizedTodayPoints ?? 0,
      realizedWeekPoints: parsed.realizedWeekPoints ?? 0,
      realizedEvents: Array.isArray(parsed.realizedEvents)
        ? parsed.realizedEvents
            .filter((event) => event && typeof event.realizedAt === "string" && Number.isFinite(event.points))
            .map((event) => ({
              id: typeof event.id === "string" ? event.id : `legacy-${event.realizedAt}`,
              points: event.points,
              realizedAt: event.realizedAt,
            }))
        : [],
    };
  } catch {
    return createInitialLedgerState(loadResetNavPoints());
  }
}

export function saveLedgerState(state: LedgerState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
