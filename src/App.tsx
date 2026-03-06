import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject, type TouchEvent } from "react";
import {
  addTrade,
  applyKospiIntrinsicAll,
  buildDashboard,
  closePosition,
  createInitialLedgerState,
  getDefaultUnderlying,
  updatePositionPrice,
  type LedgerState,
  type OpenPosition,
  type PositionType,
  type UnderlyingType,
} from "./domain/ledger";
import { formatKrwFromPoints, formatPoints, formatSignedPoints } from "./domain/format";
import {
  loadKospi200Value,
  loadLedgerState,
  saveKospi200Value,
  saveLedgerState,
  saveResetNavPoints,
} from "./storage/local";

type Tone = "profit" | "balance";

interface TradeFormState {
  underlying: UnderlyingType;
  type: PositionType;
  strike: string;
  qty: string;
  price: string;
}

interface PositionActionFormState {
  price: string;
  qty: string;
}

function valueColor(value: number, tone: Tone): string {
  if (value < 0) return "neg";
  if (tone === "profit" && value > 0) return "pos";
  return "neutral";
}

function positionTypeColor(type: PositionType): string {
  return type === "Put" ? "put-color" : "call-color";
}

function MetricRow(props: {
  label: string;
  points: number;
  tone: Tone;
  signed?: boolean;
  showKrw?: boolean;
}): JSX.Element {
  const colorClass = valueColor(props.points, props.tone);
  const pointsText = props.signed ? formatSignedPoints(props.points) : formatPoints(props.points);

  return (
    <div className="metric-row">
      <div className="metric-label">{props.label}</div>
      <div className={`metric-value ${colorClass}`}>{pointsText} pt</div>
      {props.showKrw === false ? <div className="metric-sub-empty" /> : null}
      {props.showKrw === false ? null : (
        <div className={`metric-sub ${colorClass}`}>{formatKrwFromPoints(props.points, props.signed ?? false)}</div>
      )}
    </div>
  );
}

function createTradeDefaults(): TradeFormState {
  return {
    underlying: getDefaultUnderlying(new Date()),
    type: "Call",
    strike: "",
    qty: "1",
    price: "0.00",
  };
}

function createPositionActionDefaults(position: OpenPosition): PositionActionFormState {
  return {
    price: formatPoints(position.currentPrice),
    qty: String(position.qty),
  };
}


function resolveWeeklyUnderlyingByTime(referenceDate: Date): UnderlyingType {
  const day = referenceDate.getDay();
  const hour = referenceDate.getHours();
  const inMonWindow = (day === 4 && hour >= 5) || day === 5 || day === 6 || day === 0 || (day === 1 && hour < 5);
  return inMonWindow ? "Mon" : "Thu";
}

function parseReferenceDateFromParams(params: URLSearchParams): Date {
  const sentAt = params.get("sentAt");
  if (!sentAt) return new Date();

  const parsed = new Date(sentAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function inferUnderlyingFromText(message: string, referenceDate: Date): UnderlyingType {
  if (/코스피200/i.test(message)) return "Month";
  if (/코스피위클리/i.test(message)) return resolveWeeklyUnderlyingByTime(referenceDate);
  return getDefaultUnderlying(referenceDate);
}

interface SmsImportActionBuy {
  mode: "buy";
  trade: TradeFormState;
}

interface SmsImportActionSell {
  mode: "sell";
  underlying: UnderlyingType;
  type: PositionType;
  strike: number;
  qty: number;
  price: number;
}

type SmsImportAction = SmsImportActionBuy | SmsImportActionSell;

function parseSmsImportAction(message: string, referenceDate: Date): SmsImportAction | null {
  const normalized = message.replace(/\r/g, "");
  const isBuy = /매수/i.test(normalized);
  const isSell = /매도/i.test(normalized);
  if (!isBuy && !isSell) return null;

  const typeMatch = normalized.match(/\b([CP])\b/i);
  const strikeMatch = normalized.match(/\b[CP]\s+([0-9]+(?:\.[0-9]+)?)/i);
  const qtyMatch = normalized.match(/([0-9]+)\s*계약/i);
  const priceMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*P\b/i);
  if (!typeMatch || !strikeMatch || !qtyMatch || !priceMatch) return null;

  const parsedStrike = Number(strikeMatch[1]);
  const parsedQty = Number(qtyMatch[1]);
  const parsedPrice = Number(priceMatch[1]);
  if (!Number.isFinite(parsedStrike) || !Number.isFinite(parsedQty) || !Number.isFinite(parsedPrice)) return null;

  const underlying = inferUnderlyingFromText(normalized, referenceDate);
  const type: PositionType = typeMatch[1].toUpperCase() === "P" ? "Put" : "Call";
  const strike = Math.max(0, Math.round(parsedStrike));
  const qty = Math.max(1, Math.round(parsedQty));
  const price = Math.max(0, parsedPrice);

  if (isBuy) {
    return {
      mode: "buy",
      trade: {
        underlying,
        type,
        strike: String(strike),
        qty: String(qty),
        price: price.toFixed(2),
      },
    };
  }

  return {
    mode: "sell",
    underlying,
    type,
    strike,
    qty,
    price,
  };
}

function parseTradeFromUrl(): SmsImportAction | null {
  const params = new URLSearchParams(window.location.search);
  const referenceDate = parseReferenceDateFromParams(params);

  const smsMessage = params.get("sms");
  if (smsMessage) return parseSmsImportAction(smsMessage, referenceDate);

  const typeParam = params.get("type");
  const strikeParam = params.get("strike");
  const qtyParam = params.get("qty");
  const priceParam = params.get("price");

  if (!typeParam || !strikeParam || !qtyParam || !priceParam) return null;

  const parsedStrike = Number(strikeParam);
  const parsedQty = Number(qtyParam);
  const parsedPrice = Number(priceParam);
  if (!Number.isFinite(parsedStrike) || !Number.isFinite(parsedQty) || !Number.isFinite(parsedPrice)) return null;

  const type: PositionType = /put|p/i.test(typeParam) ? "Put" : "Call";
  const underlyingParam = params.get("underlying");
  const underlying: UnderlyingType =
    underlyingParam === "Mon" || underlyingParam === "Thu" || underlyingParam === "Month"
      ? underlyingParam
      : getDefaultUnderlying(referenceDate);

  const side = params.get("side");
  const strike = Math.max(0, Math.round(parsedStrike));
  const qty = Math.max(1, Math.round(parsedQty));
  const price = Math.max(0, parsedPrice);

  if (side && /sell|매도/i.test(side)) {
    return {
      mode: "sell",
      underlying,
      type,
      strike,
      qty,
      price,
    };
  }

  return {
    mode: "buy",
    trade: {
      underlying,
      type,
      strike: String(strike),
      qty: String(qty),
      price: price.toFixed(2),
    },
  };
}
function parsePriceCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function applyDigitShiftInput(nextRaw: string): string {
  const cleaned = nextRaw.replace(/[^0-9.]/g, "");
  if (!cleaned) return "0.00";

  if (cleaned.includes(".")) {
    const parsedDecimal = Number(cleaned);
    return (Number.isFinite(parsedDecimal) ? Math.max(0, parsedDecimal) : 0).toFixed(2);
  }

  const cents = Number(cleaned);
  return (Number.isFinite(cents) ? cents / 100 : 0).toFixed(2);
}

function handleDigitShiftKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  currentValue: string,
  onChange: (value: string) => void,
): void {
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    const nextCents = parsePriceCents(currentValue) * 10 + Number(event.key);
    onChange((nextCents / 100).toFixed(2));
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    const nextCents = Math.floor(parsePriceCents(currentValue) / 10);
    onChange((nextCents / 100).toFixed(2));
    return;
  }

  if (event.key === "Delete") {
    event.preventDefault();
    onChange("0.00");
  }
}

function ToggleGroup<T extends string>(props: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  label: string;
}): JSX.Element {
  return (
    <div className="form-row">
      <span className="form-label">{props.label}</span>
      <div
        className="toggle-group"
        style={{ gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }}
      >
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`toggle-btn ${props.value === option ? "active" : ""}`}
            onClick={() => props.onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  min: number;
  integer?: boolean;
  showHint?: boolean;
  digitShift?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}): JSX.Element {
  const parsed = Number(props.value);
  const displayStep = props.integer ? String(props.step) : props.step.toFixed(2);

  function bump(delta: number): void {
    const next = Number.isFinite(parsed) ? parsed + delta : props.min;
    const bounded = Math.max(props.min, next);
    props.onChange(props.integer ? String(Math.round(bounded)) : bounded.toFixed(2));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!props.digitShift) return;
    handleDigitShiftKeyDown(event, props.value, props.onChange);
  }

  function onInputChange(nextRaw: string): void {
    if (props.integer) {
      const cleaned = nextRaw.replace(/[^0-9]/g, "");
      props.onChange(cleaned ? String(Number(cleaned)) : "");
      return;
    }

    if (!props.digitShift) {
      props.onChange(nextRaw);
      return;
    }

    props.onChange(applyDigitShiftInput(nextRaw));
  }

  return (
    <div className="form-row">
      <span className="form-label">{props.label}</span>
      <div className="step-field">
        <button type="button" className="step-btn" onClick={() => bump(-props.step)}>
          -
        </button>
        <input
          ref={props.inputRef}
          aria-label={props.label}
          className="number-input"
          value={props.value}
          inputMode={props.integer ? "numeric" : "decimal"}
          onKeyDown={onKeyDown}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <button type="button" className="step-btn" onClick={() => bump(props.step)}>
          +
        </button>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [state, setState] = useState<LedgerState>(() => loadLedgerState());
  const [isTradeOpen, setTradeOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState<TradeFormState>(() => createTradeDefaults());
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [positionActionForm, setPositionActionForm] = useState<PositionActionFormState>({ price: "0.00", qty: "1" });
  const [kospiInput, setKospiInput] = useState<string>(() => {
    const latest = loadKospi200Value();
    return latest === undefined ? "0" : String(Math.max(0, Math.round(latest)));
  });
  const [resetNavInput, setResetNavInput] = useState<string>(formatPoints(state.startingNavPoints));
  const [isBusy, setBusy] = useState(false);
  const [showNavKrw, setShowNavKrw] = useState(false);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const pendingReconcile = useRef(0);
  const touchStartX = useRef<Record<string, number>>({});
  const longPressTimers = useRef<Record<string, number>>({});
  const suppressOpenIds = useRef<Record<string, boolean>>({});
  const strikeInputRef = useRef<HTMLInputElement>(null);

  const dashboard = useMemo(() => buildDashboard(state), [state]);
  const selectedPosition = useMemo(
    () => state.openPositions.find((position) => position.id === selectedPositionId) ?? null,
    [state.openPositions, selectedPositionId],
  );

  useEffect(() => {
    const importAction = parseTradeFromUrl();
    if (!importAction) return;

    if (importAction.mode === "buy") {
      setTradeForm(importAction.trade);
      setTradeOpen(true);
      window.setTimeout(() => strikeInputRef.current?.focus(), 0);
    } else {
      const target = state.openPositions.find(
        (position) =>
          position.underlying === importAction.underlying &&
          position.type === importAction.type &&
          position.strike === importAction.strike,
      );

      if (target) {
        setSelectedPositionId(target.id);
        setPositionActionForm({
          price: importAction.price.toFixed(2),
          qty: String(Math.min(target.qty, importAction.qty)),
        });
      }
    }

    const params = new URLSearchParams(window.location.search);
    params.delete("sms");
    params.delete("type");
    params.delete("strike");
    params.delete("qty");
    params.delete("price");
    params.delete("underlying");
    params.delete("side");
    params.delete("sentAt");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [state.openPositions]);

  function openTradeSheet(): void {
    setTradeForm(createTradeDefaults());
    setTradeOpen(true);
    window.setTimeout(() => strikeInputRef.current?.focus(), 0);
  }

  function openPositionActions(position: OpenPosition): void {
    setSelectedPositionId(position.id);
    setPositionActionForm(createPositionActionDefaults(position));
  }

  function closePositionActions(): void {
    setSelectedPositionId(null);
  }

  function commit(nextState: LedgerState): void {
    saveLedgerState(nextState);
    setState(nextState);
  }

  function beginReconcilePulse(): void {
    pendingReconcile.current += 1;
    setBusy(true);
    window.setTimeout(() => {
      pendingReconcile.current = Math.max(0, pendingReconcile.current - 1);
      if (pendingReconcile.current === 0) {
        setBusy(false);
      }
    }, 260);
  }

  function mutate(nextState: LedgerState, after?: () => void): void {
    commit(nextState);
    if (after) after();
    beginReconcilePulse();
  }

  function removePositionWithoutSettlement(positionId: string, askConfirm: boolean): void {
    if (askConfirm && !window.confirm("Would you like to remove the transaction?")) {
      setSwipeOffsets((current) => ({ ...current, [positionId]: 0 }));
      return;
    }

    const nextState: LedgerState = {
      ...state,
      openPositions: state.openPositions.filter((position) => position.id !== positionId),
    };
    setSwipeOffsets((current) => ({ ...current, [positionId]: 0 }));
    mutate(nextState, closePositionActions);
  }

  function clearLongPress(id: string): void {
    const timerId = longPressTimers.current[id];
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      delete longPressTimers.current[id];
    }
  }

  function startLongPress(id: string): void {
    clearLongPress(id);
    longPressTimers.current[id] = window.setTimeout(() => {
      suppressOpenIds.current[id] = true;
      removePositionWithoutSettlement(id, false);
    }, 650);
  }

  function setSwipeOffset(id: string, value: number): void {
    setSwipeOffsets((current) => ({ ...current, [id]: Math.min(0, Math.max(-110, value)) }));
  }

  function onItemTouchStart(positionId: string, event: TouchEvent<HTMLButtonElement>): void {
    touchStartX.current[positionId] = event.changedTouches[0]?.clientX ?? 0;
    setSwipeOffset(positionId, 0);
    startLongPress(positionId);
  }

  function onItemTouchMove(positionId: string, event: TouchEvent<HTMLButtonElement>): void {
    const start = touchStartX.current[positionId];
    if (start === undefined) return;

    const currentX = event.changedTouches[0]?.clientX ?? start;
    const delta = currentX - start;
    if (Math.abs(delta) > 10) {
      clearLongPress(positionId);
    }

    setSwipeOffset(positionId, delta < 0 ? delta : 0);
  }

  function onItemTouchEnd(positionId: string): void {
    clearLongPress(positionId);
    const offset = swipeOffsets[positionId] ?? 0;
    if (offset <= -80) {
      suppressOpenIds.current[positionId] = true;
      removePositionWithoutSettlement(positionId, true);
      return;
    }

    setSwipeOffset(positionId, 0);
  }

  function onItemMouseDown(positionId: string): void {
    startLongPress(positionId);
  }

  function onItemMouseUp(positionId: string): void {
    clearLongPress(positionId);
  }

  function handlePositionItemClick(position: OpenPosition): void {
    if (suppressOpenIds.current[position.id]) {
      delete suppressOpenIds.current[position.id];
      return;
    }

    openPositionActions(position);
  }

  function handleSaveTrade(): void {
    const strike = Math.max(0, Math.round(Number(tradeForm.strike) || 0));
    const qty = Math.max(1, Math.round(Number(tradeForm.qty) || 1));
    const price = Math.max(0, Number(tradeForm.price) || 0);

    const nextState = addTrade(state, {
      underlying: tradeForm.underlying,
      type: tradeForm.type,
      strike,
      qty,
      price,
    });

    mutate(nextState, () => setTradeOpen(false));
  }

  function handleUpdatePosition(): void {
    if (!selectedPosition) return;
    const price = Math.max(0, Number(positionActionForm.price) || 0);
    const nextState = updatePositionPrice(state, selectedPosition.id, price);
    mutate(nextState, closePositionActions);
  }

  function handleClosePosition(): void {
    if (!selectedPosition) return;
    const price = Math.max(0, Number(positionActionForm.price) || 0);
    const qty = Math.max(1, Math.round(Number(positionActionForm.qty) || selectedPosition.qty));
    const nextState = closePosition(state, selectedPosition.id, qty, price);
    mutate(nextState, closePositionActions);
  }

  function bumpKospi(delta: number): void {
    const current = Number(kospiInput);
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
    setKospiInput(String(Math.round(next)));
  }

  function handleApplyKospiAll(): void {
    const kospi = Math.max(0, Math.round(Number(kospiInput)));
    if (!Number.isFinite(kospi)) return;
    setKospiInput(String(kospi));
    saveKospi200Value(kospi);
    const nextState = applyKospiIntrinsicAll(state, kospi);
    mutate(nextState);
  }

  function handleHardReset(): void {
    const navPoints = Math.max(0, Number(resetNavInput) || 17);
    const nextState = createInitialLedgerState(navPoints);
    saveResetNavPoints(navPoints);
    mutate(nextState, () => {
      setTradeOpen(false);
      setSelectedPositionId(null);
      setKospiInput(String(Math.max(0, Math.round(loadKospi200Value() ?? 0))));
      setResetNavInput(formatPoints(navPoints));
    });
  }

  const navPointsLabel = `${formatPoints(dashboard.cashPoints)} / ${formatPoints(dashboard.navPoints)} pt`;

  return (
    <main className="app-shell">
      {isBusy ? (
        <div className="busy-indicator" role="status" aria-live="polite">
          <span className="busy-dot" />
          Processing...
        </div>
      ) : null}

      <section className="card">
        <div className="metric-row nav-row">
          <div className="metric-label">NAV</div>
          <button
            type="button"
            className={`metric-toggle metric-value ${valueColor(dashboard.navPoints, "balance")}`}
            onClick={() => setShowNavKrw((current) => !current)}
            aria-label={showNavKrw ? formatKrwFromPoints(dashboard.navPoints) : navPointsLabel}
          >
            {showNavKrw ? formatKrwFromPoints(dashboard.navPoints) : navPointsLabel}
          </button>
        </div>

        <MetricRow label="Unrealized P&L" points={dashboard.unrealizedPoints} tone="profit" signed showKrw={false} />
        <MetricRow label="Realized P&L" points={dashboard.realizedTodayPoints} tone="profit" signed showKrw={false} />
      </section>

      <section className="card">
        <div className="card-topline card-topline-open">
          <h2>Open Positions</h2>
          <span className={`position-value-chip ${valueColor(dashboard.marketValuePoints, "balance")}`}>
            {formatPoints(dashboard.marketValuePoints)} pt
          </span>
        </div>

        {state.openPositions.length === 0 ? (
          <p className="empty-state">No open positions yet.</p>
        ) : (
          <div className="positions-list">
            {state.openPositions.map((position) => {
              const pnlPoints =
                (position.currentPrice - position.entryPrice) * position.qty - position.remainingEntryFeePoints;
              return (
                <button
                  key={position.id}
                  type="button"
                  className="position-item"
                  style={{ transform: `translateX(${swipeOffsets[position.id] ?? 0}px)` }}
                  onTouchStart={(event) => onItemTouchStart(position.id, event)}
                  onTouchMove={(event) => onItemTouchMove(position.id, event)}
                  onTouchEnd={() => onItemTouchEnd(position.id)}
                  onTouchCancel={() => onItemTouchEnd(position.id)}
                  onMouseDown={() => onItemMouseDown(position.id)}
                  onMouseUp={() => onItemMouseUp(position.id)}
                  onMouseLeave={() => onItemMouseUp(position.id)}
                  onClick={() => handlePositionItemClick(position)}
                >
                  <div className="position-row">
                    <span className="position-line-main">
                      {position.underlying} <span className={positionTypeColor(position.type)}>{position.type}</span> {position.strike}
                    </span>
                    <span className="position-line-sub">Qty {position.qty} | Avg {formatPoints(position.entryPrice)}</span>
                  </div>
                  <div className="position-row">
                    <span className={`position-line-pnl ${valueColor(pnlPoints, "profit")}`}>{formatSignedPoints(pnlPoints)} pt</span>
                    <span className="position-line-sub">Value {formatPoints(position.currentPrice * position.qty)} pt</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button type="button" className="primary-btn new-trade-footer-btn" onClick={openTradeSheet}>
          New Trade
        </button>
      </section>

      <section className="card">
        <div className="card-topline">
          <h2>KOSPI200</h2>
        </div>
        <div className="kospi-row">
          <div className="step-field">
            <button type="button" className="step-btn" onClick={() => bumpKospi(-5)}>
              -
            </button>
            <input
              aria-label="KOSPI200"
              className="number-input"
              value={kospiInput}
              inputMode="numeric"
              onChange={(event) => {
                const cleaned = event.target.value.replace(/[^0-9]/g, "");
                setKospiInput(cleaned ? String(Number(cleaned)) : "");
              }}
            />
            <button type="button" className="step-btn" onClick={() => bumpKospi(5)}>
              +
            </button>
          </div>
          <button type="button" className="primary-btn" onClick={handleApplyKospiAll}>
            Apply All
          </button>
        </div>
      </section>

      <details className="card reset-card">
        <summary>Reset</summary>
        <div className="reset-row">
          <label htmlFor="hard-reset-nav" className="form-label">
            Hard Reset NAV (points)
          </label>
          <input
            id="hard-reset-nav"
            aria-label="Hard Reset NAV"
            className="number-input"
            value={resetNavInput}
            inputMode="decimal"
            onChange={(event) => setResetNavInput(event.target.value)}
          />
        </div>
        <button type="button" className="danger-btn" onClick={handleHardReset}>
          Hard Reset Ledger
        </button>
      </details>

      {isTradeOpen ? (
        <section className="sheet-overlay" aria-label="New Trade Modal">
          <div className="sheet">
            <h2>New Trade</h2>

            <ToggleGroup
              label="Underlying"
              value={tradeForm.underlying}
              options={["Mon", "Thu", "Month"]}
              onChange={(value) => setTradeForm((current) => ({ ...current, underlying: value }))}
            />

            <ToggleGroup
              label="Type"
              value={tradeForm.type}
              options={["Call", "Put"]}
              onChange={(value) => setTradeForm((current) => ({ ...current, type: value }))}
            />

            <NumberField
              label="Strike"
              value={tradeForm.strike}
              inputRef={strikeInputRef}
              integer
              step={1}
              min={0}
              onChange={(value) => setTradeForm((current) => ({ ...current, strike: value }))}
            />

            <NumberField
              label="Qty"
              value={tradeForm.qty}
              integer
              step={1}
              min={1}
              onChange={(value) => setTradeForm((current) => ({ ...current, qty: value }))}
            />

            <NumberField
              label="Price"
              value={tradeForm.price}
              step={0.05}
              min={0}
              digitShift
              showHint={false}
              onChange={(value) => setTradeForm((current) => ({ ...current, price: value }))}
            />

            <div className="sheet-actions">
              <button type="button" className="ghost-btn" onClick={() => setTradeOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleSaveTrade}>
                Save Trade
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedPosition ? (
        <section className="sheet-overlay" aria-label="Position Action Modal">
          <div className="sheet">
            <div className="sheet-header">
              <h2>
                {selectedPosition.underlying} {selectedPosition.type} {selectedPosition.strike}
              </h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closePositionActions}>
                x
              </button>
            </div>

            <NumberField
              label="Price"
              value={positionActionForm.price}
              step={0.05}
              min={0}
              digitShift
              showHint={false}
              onChange={(value) => setPositionActionForm((current) => ({ ...current, price: value }))}
            />

            <NumberField
              label="Qty"
              value={positionActionForm.qty}
              integer
              step={1}
              min={1}
              showHint={false}
              onChange={(value) => setPositionActionForm((current) => ({ ...current, qty: value }))}
            />

            <div className="sheet-actions">
              <button type="button" className="danger-btn" onClick={handleClosePosition}>
                Close
              </button>
              <button type="button" className="primary-btn" onClick={handleUpdatePosition}>
                Update
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}







