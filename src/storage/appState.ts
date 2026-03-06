import { createInitialLedgerState, normalizeOpenPositions, type LedgerState } from "../domain/ledger";
import {
  loadKospi200Value,
  loadLedgerState,
  saveKospi200Value,
  saveLedgerState,
} from "./local";

export interface PersistedAppState {
  ledgerState: LedgerState;
  kospi200Value?: number;
}

function isServerPersistenceEnabled(): boolean {
  return window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
}

function normalizeLedgerState(state: LedgerState | null | undefined): LedgerState {
  const parsed = state ?? createInitialLedgerState();
  return {
    startingNavPoints: Number.isFinite(parsed.startingNavPoints) ? parsed.startingNavPoints : 17,
    cashPoints: Number.isFinite(parsed.cashPoints) ? parsed.cashPoints : 17,
    openPositions: normalizeOpenPositions(parsed.openPositions ?? []),
    realizedTodayPoints: parsed.realizedTodayPoints ?? 0,
    realizedWeekPoints: parsed.realizedWeekPoints ?? 0,
  };
}

function normalizeSnapshot(snapshot: Partial<PersistedAppState> | null | undefined): PersistedAppState {
  const kospi200Value =
    typeof snapshot?.kospi200Value === "number" && Number.isFinite(snapshot.kospi200Value)
      ? Math.max(0, Math.round(snapshot.kospi200Value))
      : undefined;

  return {
    ledgerState: normalizeLedgerState(snapshot?.ledgerState),
    ...(kospi200Value === undefined ? {} : { kospi200Value }),
  };
}

function isDefaultSnapshot(snapshot: PersistedAppState): boolean {
  return (
    snapshot.ledgerState.startingNavPoints === 17 &&
    snapshot.ledgerState.cashPoints === 17 &&
    snapshot.ledgerState.openPositions.length === 0 &&
    snapshot.ledgerState.realizedTodayPoints === 0 &&
    snapshot.ledgerState.realizedWeekPoints === 0 &&
    snapshot.kospi200Value === undefined
  );
}

function hasMeaningfulLocalData(snapshot: PersistedAppState): boolean {
  return !isDefaultSnapshot(snapshot);
}

export function loadLocalAppState(): PersistedAppState {
  return normalizeSnapshot({
    ledgerState: loadLedgerState(),
    kospi200Value: loadKospi200Value(),
  });
}

export function saveLocalAppState(snapshot: PersistedAppState): void {
  saveLedgerState(snapshot.ledgerState);
  if (snapshot.kospi200Value !== undefined) {
    saveKospi200Value(snapshot.kospi200Value);
  }
}

export function loadInitialAppState(): PersistedAppState {
  if (!isServerPersistenceEnabled()) return loadLocalAppState();
  return normalizeSnapshot({ ledgerState: createInitialLedgerState() });
}

export async function loadPersistedAppState(): Promise<PersistedAppState> {
  if (!isServerPersistenceEnabled() || typeof fetch !== "function") return loadLocalAppState();

  const response = await fetch("/api/app-state");
  if (!response.ok) {
    throw new Error(`Failed to load app state (${response.status})`);
  }

  const remoteSnapshot = normalizeSnapshot((await response.json()) as Partial<PersistedAppState>);
  const localSnapshot = loadLocalAppState();

  if (isDefaultSnapshot(remoteSnapshot) && hasMeaningfulLocalData(localSnapshot)) {
    await savePersistedAppState(localSnapshot);
    return localSnapshot;
  }

  return remoteSnapshot;
}

export async function savePersistedAppState(snapshot: PersistedAppState): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);

  if (!isServerPersistenceEnabled() || typeof fetch !== "function") {
    saveLocalAppState(normalized);
    return;
  }

  const response = await fetch("/api/app-state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(normalized),
  });

  if (!response.ok) {
    throw new Error(`Failed to save app state (${response.status})`);
  }
}

export function canUseServerPersistence(): boolean {
  return isServerPersistenceEnabled();
}
