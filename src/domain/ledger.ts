export const POINT_TO_KRW = 250000;
export const TRADE_FEE_RATE = 0.004;

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
  remainingEntryFeePoints: number;
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
    const normalized: OpenPosition = {
      ...position,
      remainingEntryFeePoints: position.remainingEntryFeePoints ?? 0,
    };

    const key = positionKey(normalized);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...normalized });
      continue;
    }

    const totalQty = existing.qty + normalized.qty;
    const weightedEntry = (existing.entryPrice * existing.qty + normalized.entryPrice * normalized.qty) / totalQty;
    const newer = new Date(normalized.updatedAt).getTime() >= new Date(existing.updatedAt).getTime() ? normalized : existing;

    merged.set(key, {
      ...existing,
      id: newer.id,
      updatedAt: newer.updatedAt,
      qty: totalQty,
      entryPrice: weightedEntry,
      currentPrice: newer.currentPrice,
      remainingEntryFeePoints: existing.remainingEntryFeePoints + normalized.remainingEntryFeePoints,
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
  return openPositions.reduce(
    (sum, pos) => sum + (pos.currentPrice - pos.entryPrice) * pos.qty - pos.remainingEntryFeePoints,
    0,
  );
}

export function calculateMarketValuePoints(openPositions: OpenPosition[]): number {
  return openPositions.reduce((sum, pos) => sum + pos.currentPrice * pos.qty, 0);
}

export function sortOpenPositions(openPositions: OpenPosition[]): OpenPosition[] {
  const underlyingOrder: Record<UnderlyingType, number> = { Mon: 0, Thu: 1, Month: 2 };
  const typeOrder: Record<PositionType, number> = { Call: 0, Put: 1 };

  return [...openPositions].sort((a, b) => {
    const underlyingDiff = underlyingOrder[a.underlying] - underlyingOrder[b.underlying];
    if (underlyingDiff !== 0) return underlyingDiff;

    const typeDiff = typeOrder[a.type] - typeOrder[b.type];
    if (typeDiff !== 0) return typeDiff;

    if (a.type === "Call") return a.strike - b.strike;
    return b.strike - a.strike;
  });
}

export function addTrade(state: LedgerState, trade: NewTradeInput, now: Date = new Date()): LedgerState {
  const buyNotional = trade.price * trade.qty;
  const buyFee = buyNotional * TRADE_FEE_RATE;

  const newPosition: OpenPosition = {
    id: `pos-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    updatedAt: now.toISOString(),
    underlying: trade.underlying,
    type: trade.type,
    strike: trade.strike,
    qty: trade.qty,
    entryPrice: trade.price,
    currentPrice: trade.price,
    remainingEntryFeePoints: buyFee,
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
          remainingEntryFeePoints: position.remainingEntryFeePoints + buyFee,
        };
      })
    : [newPosition, ...state.openPositions];

  return {
    ...state,
    cashPoints: state.cashPoints - buyNotional - buyFee,
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


export interface UpdatePositionInput {
  underlying: UnderlyingType;
  type: PositionType;
  strike: number;
  currentPrice: number;
}

export function updateOpenPosition(
  state: LedgerState,
  positionId: string,
  updates: UpdatePositionInput,
  now: Date = new Date(),
): LedgerState {
  const normalizedStrike = Math.max(0, Math.round(updates.strike));
  const normalizedPrice = Math.max(0, updates.currentPrice);

  const nextOpenPositions = state.openPositions.map((position) =>
    position.id === positionId
      ? {
          ...position,
          underlying: updates.underlying,
          type: updates.type,
          strike: normalizedStrike,
          currentPrice: normalizedPrice,
          updatedAt: now.toISOString(),
        }
      : position,
  );

  return {
    ...state,
    openPositions: normalizeOpenPositions(nextOpenPositions),
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
  const sellNotional = price * executedQty;
  const sellFee = sellNotional * TRADE_FEE_RATE;
  const entryFeeShare = target.remainingEntryFeePoints * (executedQty / target.qty);
  const realizedPoints = (price - target.entryPrice) * executedQty - entryFeeShare - sellFee;

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
        remainingEntryFeePoints: Math.max(0, position.remainingEntryFeePoints - entryFeeShare),
      };
    })
    .filter((position): position is OpenPosition => position !== null);

  return {
    ...state,
    cashPoints: state.cashPoints + sellNotional - sellFee,
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
  const inMonWindow = (day === 4 && hour >= 3) || day === 5 || day === 6 || day === 0 || (day === 1 && hour < 3);
  return inMonWindow ? "Mon" : "Thu";
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



