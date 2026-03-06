import { useMemo, useState } from "react";
import {
  addTrade,
  buildDashboard,
  closePosition,
  getDefaultUnderlying,
  updatePositionPrice,
  type LedgerState,
  type OpenPosition,
  type PositionType,
  type UnderlyingType,
} from "./domain/ledger";
import { formatKrwFromPoints, formatPoints } from "./domain/format";
import { loadLedgerState, saveLedgerState } from "./storage/local";

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

function MetricRow(props: { label: string; points: number; tone: Tone }): JSX.Element {
  const colorClass = valueColor(props.points, props.tone);
  return (
    <div className="metric-row">
      <div className="metric-label">{props.label}</div>
      <div className={`metric-value ${colorClass}`}>{formatPoints(props.points)} pt</div>
      <div className={`metric-sub ${colorClass}`}>{formatKrwFromPoints(props.points)}</div>
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
}): JSX.Element {
  const parsed = Number(props.value);
  const displayStep = props.integer ? String(props.step) : props.step.toFixed(2);

  function bump(delta: number): void {
    const next = Number.isFinite(parsed) ? parsed + delta : props.min;
    const bounded = Math.max(props.min, next);
    props.onChange(props.integer ? String(Math.round(bounded)) : bounded.toFixed(2));
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
          onChange={(event) => props.onChange(event.target.value)}
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

    commit(nextState);
    setTradeOpen(false);
  }

  function handleUpdatePosition(): void {
    if (!selectedPosition) return;
    const price = Math.max(0, Number(positionActionForm.price) || 0);
    const nextState = updatePositionPrice(state, selectedPosition.id, price);
    commit(nextState);
    closePositionActions();
  }

  function handleClosePosition(): void {
    if (!selectedPosition) return;
    const price = Math.max(0, Number(positionActionForm.price) || 0);
    const qty = Math.max(1, Math.round(Number(positionActionForm.qty) || selectedPosition.qty));
    const nextState = closePosition(state, selectedPosition.id, qty, price);
    commit(nextState);
    closePositionActions();
  }

  return (
    <main className="app-shell">
      <header className="header">
        <h1>Options Ledger</h1>
        <p>Single-user local ledger</p>
      </header>

      <section className="card">
        <h2>Dashboard</h2>
        <MetricRow label="NAV" points={dashboard.navPoints} tone="balance" />
        <MetricRow label="Cash" points={dashboard.cashPoints} tone="balance" />
        <MetricRow label="Unrealized P&L" points={dashboard.unrealizedPoints} tone="profit" />
        <MetricRow label="Realized Today" points={dashboard.realizedTodayPoints} tone="profit" />
        <MetricRow label="Realized Week" points={dashboard.realizedWeekPoints} tone="profit" />
      </section>

      <section className="card">
        <div className="card-topline">
          <h2>Open Positions</h2>
          <button type="button" className="primary-btn" onClick={openTradeSheet}>
            New Trade
          </button>
        </div>

        {state.openPositions.length === 0 ? (
          <p className="empty-state">No open positions yet.</p>
        ) : (
          <div className="positions-list">
            {state.openPositions.map((position) => (
              <button
                key={position.id}
                type="button"
                className="position-item"
                onClick={() => openPositionActions(position)}
              >
                <span>
                  {position.underlying} {position.type} {position.strike}
                </span>
                <span>
                  {position.qty} @ {formatPoints(position.currentPrice)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

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
