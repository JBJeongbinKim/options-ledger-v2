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
  marketValuePoints: number;
  unrealizedPoints: number;
  realizedTodayPoints: number;
  realizedWeekPoints: number;
}

export interface NewTradeInput {
  underlying: UnderlyingType;
  type: PositionType;
  strike: number;
  qty: number;
  price: number;
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

export function calculateMarketValuePoints(openPositions: OpenPosition[]): number {
  return openPositions.reduce((sum, pos) => sum + pos.currentPrice * pos.qty, 0);
}

export function sortOpenPositions(openPositions: OpenPosition[]): OpenPosition[] {
  return [...openPositions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function addTrade(state: LedgerState, trade: NewTradeInput, now: Date = new Date()): LedgerState {
  const position: OpenPosition = {
    id: `pos-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    updatedAt: now.toISOString(),
    underlying: trade.underlying,
    type: trade.type,
    strike: trade.strike,
    qty: trade.qty,
    entryPrice: trade.price,
    currentPrice: trade.price,
  };

  return {
    ...state,
    cashPoints: state.cashPoints - trade.price * trade.qty,
    openPositions: sortOpenPositions([position, ...state.openPositions]),
  };
}

export function getDefaultUnderlying(now: Date): UnderlyingType {
  const day = now.getDay();
  const hour = now.getHours();
  const isFridayToSunday = day === 5 || day === 6 || day === 0;
  const isEarlyMonday = day === 1 && hour < 3;
  const isEarlyThursday = day === 4 && hour < 3;

  if (isFridayToSunday || isEarlyMonday || isEarlyThursday) {
    return "Mon";
  }
  return "Thu";
}

export function buildDashboard(state: LedgerState): DashboardSnapshot {
  const marketValuePoints = calculateMarketValuePoints(state.openPositions);
  const unrealizedPoints = calculateUnrealizedPoints(state.openPositions);
  const navPoints = state.cashPoints + marketValuePoints;

  return {
    navPoints,
    cashPoints: state.cashPoints,
    marketValuePoints,
    unrealizedPoints,
    realizedTodayPoints: state.realizedTodayPoints,
    realizedWeekPoints: state.realizedWeekPoints,
  };
}
