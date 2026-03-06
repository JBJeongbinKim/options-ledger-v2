export const POINT_TO_KRW = 250000;

export type PositionType = "Call" | "Put";
export type UnderlyingType = "Mon" | "Thu" | "Month";

export interface OpenPosition {
  id: string;
  updatedAt: string;
  underlying: UnderlyingType;
  type: PositionType;
  strike: number;
  qty: number;
  entryPrice: number;
  currentPrice: number;
}

export interface LedgerState {
  startingNavPoints: number;
  cashPoints: number;
  openPositions: OpenPosition[];
  realizedTodayPoints: number;
  realizedWeekPoints: number;
}

export interface DashboardSnapshot {
  navPoints: number;
  cashPoints: number;
  unrealizedPoints: number;
  realizedTodayPoints: number;
  realizedWeekPoints: number;
}

export function createInitialLedgerState(resetNavPoints?: number): LedgerState {
  const start = resetNavPoints ?? 17;
  return {
    startingNavPoints: start,
    cashPoints: start,
    openPositions: [],
    realizedTodayPoints: 0,
    realizedWeekPoints: 0,
  };
}

export function calculateUnrealizedPoints(openPositions: OpenPosition[]): number {
  return openPositions.reduce((sum, pos) => sum + (pos.currentPrice - pos.entryPrice) * pos.qty, 0);
}

export function buildDashboard(state: LedgerState): DashboardSnapshot {
  const unrealizedPoints = calculateUnrealizedPoints(state.openPositions);
  const navPoints = state.cashPoints + unrealizedPoints;

  return {
    navPoints,
    cashPoints: state.cashPoints,
    unrealizedPoints,
    realizedTodayPoints: state.realizedTodayPoints,
    realizedWeekPoints: state.realizedWeekPoints,
  };
}
