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

function positionKey(position: Pick<OpenPosition, "underlying" | "type" | "strike">): string {
  return `${position.underlying}|${position.type}|${position.strike}`;
}

export function normalizeOpenPositions(openPositions: OpenPosition[]): OpenPosition[] {
  const merged = new Map<string, OpenPosition>();

  for (const position of openPositions) {
    const key = positionKey(position);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...position });
      continue;
    }

    const totalQty = existing.qty + position.qty;
    const weightedEntry = (existing.entryPrice * existing.qty + position.entryPrice * position.qty) / totalQty;
    const newer = new Date(position.updatedAt).getTime() >= new Date(existing.updatedAt).getTime() ? position : existing;

    merged.set(key, {
      ...existing,
      id: newer.id,
      updatedAt: newer.updatedAt,
      qty: totalQty,
      entryPrice: weightedEntry,
      currentPrice: newer.currentPrice,
    });
  }

  return sortOpenPositions(Array.from(merged.values()));
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
  const newPosition: OpenPosition = {
    id: `pos-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    updatedAt: now.toISOString(),
    underlying: trade.underlying,
    type: trade.type,
    strike: trade.strike,
    qty: trade.qty,
    entryPrice: trade.price,
    currentPrice: trade.price,
  };

  const key = positionKey(newPosition);
  const existing = state.openPositions.find((position) => positionKey(position) === key);

  const nextOpenPositions = existing
    ? state.openPositions.map((position) => {
        if (positionKey(position) !== key) return position;
        const totalQty = position.qty + trade.qty;
        return {
          ...position,
          qty: totalQty,
          entryPrice: (position.entryPrice * position.qty + trade.price * trade.qty) / totalQty,
          currentPrice: trade.price,
          updatedAt: now.toISOString(),
        };
      })
    : [newPosition, ...state.openPositions];

  return {
    ...state,
    cashPoints: state.cashPoints - trade.price * trade.qty,
    openPositions: sortOpenPositions(nextOpenPositions),
  };
}

export function updatePositionPrice(
  state: LedgerState,
  positionId: string,
  newPrice: number,
  now: Date = new Date(),
): LedgerState {
  const normalized = Math.max(0, newPrice);
  return {
    ...state,
    openPositions: sortOpenPositions(
      state.openPositions.map((position) =>
        position.id === positionId
          ? {
              ...position,
              currentPrice: normalized,
              updatedAt: now.toISOString(),
            }
          : position,
      ),
    ),
  };
}

export function closePosition(
  state: LedgerState,
  positionId: string,
  closeQty: number,
  closePrice: number,
  now: Date = new Date(),
): LedgerState {
  const qty = Math.max(1, Math.floor(closeQty));
  const price = Math.max(0, closePrice);
  const target = state.openPositions.find((position) => position.id === positionId);
  if (!target) return state;

  const executedQty = Math.min(qty, target.qty);
  const realizedPoints = (price - target.entryPrice) * executedQty;

  const updatedPositions = state.openPositions
    .map((position) => {
      if (position.id !== positionId) return position;

      const remainingQty = position.qty - executedQty;
      if (remainingQty <= 0) return null;

      return {
        ...position,
        qty: remainingQty,
        currentPrice: price,
        updatedAt: now.toISOString(),
      };
    })
    .filter((position): position is OpenPosition => position !== null);

  return {
    ...state,
    cashPoints: state.cashPoints + price * executedQty,
    realizedTodayPoints: state.realizedTodayPoints + realizedPoints,
    realizedWeekPoints: state.realizedWeekPoints + realizedPoints,
    openPositions: sortOpenPositions(updatedPositions),
  };
}

export function applyKospiIntrinsicAll(state: LedgerState, kospi200: number, now: Date = new Date()): LedgerState {
  const underlying = Math.max(0, kospi200);
  const updated = state.openPositions.map((position) => {
    const intrinsic =
      position.type === "Call" ? Math.max(0, underlying - position.strike) : Math.max(0, position.strike - underlying);

    return {
      ...position,
      currentPrice: intrinsic,
      updatedAt: now.toISOString(),
    };
  });

  return {
    ...state,
    openPositions: sortOpenPositions(updated),
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
