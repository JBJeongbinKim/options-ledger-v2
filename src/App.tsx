import { useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { loadLedgerState, saveLedgerState, saveResetNavPoints } from "./storage/local";

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

function createTradeDefaults(state: LedgerState): TradeFormState {
  return {
    underlying: getDefaultUnderlying(new Date()),
    type: "Call",
    strike: String(state.openPositions[0]?.strike ?? 0),
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

function parsePriceCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
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
      <div className="toggle-group">
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
  digitShift?: boolean;
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

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const nextCents = parsePriceCents(props.value) * 10 + Number(event.key);
      props.onChange((nextCents / 100).toFixed(2));
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      const nextCents = Math.floor(parsePriceCents(props.value) / 10);
      props.onChange((nextCents / 100).toFixed(2));
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      props.onChange("0.00");
    }
  }

  function onInputChange(nextRaw: string): void {
    if (!props.digitShift) {
      props.onChange(nextRaw);
      return;
    }

    const cleaned = nextRaw.replace(/[^0-9.]/g, "");
    if (!cleaned) {
      props.onChange("0.00");
      return;
    }

    if (cleaned.includes(".")) {
      const parsedDecimal = Number(cleaned);
      props.onChange((Number.isFinite(parsedDecimal) ? Math.max(0, parsedDecimal) : 0).toFixed(2));
      return;
    }

    const cents = Number(cleaned);
    props.onChange((Number.isFinite(cents) ? cents / 100 : 0).toFixed(2));
  }

  return (
    <div className="form-row">
      <span className="form-label">{props.label}</span>
      <div className="step-field">
        <button type="button" className="step-btn" onClick={() => bump(-props.step)}>
          -
        </button>
        <input
          aria-label={props.label}
          className="number-input"
          value={props.value}
          inputMode="decimal"
          onKeyDown={onKeyDown}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <button type="button" className="step-btn" onClick={() => bump(props.step)}>
          +
        </button>
      </div>
      <small className="hint">step {displayStep}</small>
    </div>
  );
}

export function App(): JSX.Element {
  const [state, setState] = useState<LedgerState>(() => loadLedgerState());
  const [isTradeOpen, setTradeOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState<TradeFormState>(() => createTradeDefaults(loadLedgerState()));
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [positionActionForm, setPositionActionForm] = useState<PositionActionFormState>({ price: "0.00", qty: "1" });
  const [kospiInput, setKospiInput] = useState<string>("");
  const [resetNavInput, setResetNavInput] = useState<string>(formatPoints(state.startingNavPoints));
  const [isBusy, setBusy] = useState(false);
  const pendingReconcile = useRef(0);

  const dashboard = useMemo(() => buildDashboard(state), [state]);
  const selectedPosition = useMemo(
    () => state.openPositions.find((position) => position.id === selectedPositionId) ?? null,
    [state.openPositions, selectedPositionId],
  );

  function openTradeSheet(): void {
    setTradeForm(createTradeDefaults(state));
    setTradeOpen(true);
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

  function handleApplyKospiAll(): void {
    const kospi = Number(kospiInput);
    if (!Number.isFinite(kospi)) return;
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
      setKospiInput("");
      setResetNavInput(formatPoints(navPoints));
    });
  }

  return (
    <main className="app-shell">
      {isBusy ? (
        <div className="busy-indicator" role="status" aria-live="polite">
          <span className="busy-dot" />
          Processing...
        </div>
      ) : null}

      <section className="card">
        <MetricRow label="NAV" points={dashboard.navPoints} tone="balance" />
        <MetricRow label="Option Values" points={dashboard.marketValuePoints} tone="balance" showKrw={false} />
        <MetricRow label="Cash" points={dashboard.cashPoints} tone="balance" showKrw={false} />
        <MetricRow label="Unrealized P&L" points={dashboard.unrealizedPoints} tone="profit" signed showKrw={false} />
        <MetricRow label="Realized P&L" points={dashboard.realizedTodayPoints} tone="profit" signed showKrw={false} />
      </section>

      <section className="card">
        <div className="card-topline card-topline-open">
          <h2>Open Positions</h2>
          <button type="button" className="primary-btn new-trade-btn" onClick={openTradeSheet}>
            New Trade
          </button>
        </div>

        {state.openPositions.length === 0 ? (
          <p className="empty-state">No open positions yet.</p>
        ) : (
          <div className="positions-list">
            {state.openPositions.map((position) => {
              const pnlPoints = (position.currentPrice - position.entryPrice) * position.qty;
              return (
                <button
                  key={position.id}
                  type="button"
                  className="position-item"
                  onClick={() => openPositionActions(position)}
                >
                  <div className="position-row">
                    <span className="position-line-main">
                      {position.underlying} {position.type} {position.strike}
                    </span>
                    <span className="position-line-sub">Qty {position.qty} | Avg {formatPoints(position.entryPrice)}</span>
                  </div>
                  <div className="position-row">
                    <span className={`position-line-pnl ${valueColor(pnlPoints, "profit")}`}>{formatSignedPoints(pnlPoints)} pt</span>
                    <span className="position-line-sub">Mkt {formatPoints(position.currentPrice)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-topline">
          <h2>KOSPI200</h2>
        </div>
        <div className="kospi-row">
          <input
            aria-label="KOSPI200"
            className="number-input"
            value={kospiInput}
            inputMode="decimal"
            placeholder="Enter KOSPI200"
            onChange={(event) => setKospiInput(event.target.value)}
          />
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
            <h2>Position Action</h2>
            <p className="sheet-subtitle">
              {selectedPosition.underlying} {selectedPosition.type} {selectedPosition.strike}
            </p>

            <NumberField
              label="Action Price"
              value={positionActionForm.price}
              step={0.05}
              min={0}
              digitShift
              onChange={(value) => setPositionActionForm((current) => ({ ...current, price: value }))}
            />

            <NumberField
              label="Action Qty"
              value={positionActionForm.qty}
              integer
              step={1}
              min={1}
              onChange={(value) => setPositionActionForm((current) => ({ ...current, qty: value }))}
            />

            <div className="sheet-actions sheet-actions-3">
              <button type="button" className="ghost-btn" onClick={closePositionActions}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleUpdatePosition}>
                Update
              </button>
              <button type="button" className="danger-btn" onClick={handleClosePosition}>
                Close
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
