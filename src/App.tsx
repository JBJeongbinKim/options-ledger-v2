import { useMemo } from "react";
import { buildDashboard } from "./domain/ledger";
import { formatKrwFromPoints, formatPoints } from "./domain/format";
import { loadLedgerState } from "./storage/local";

type Tone = "profit" | "balance";

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

export function App(): JSX.Element {
  const state = loadLedgerState();
  const dashboard = useMemo(() => buildDashboard(state), [state]);

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
        <h2>Open Positions</h2>
        <p className="empty-state">No open positions yet.</p>
      </section>
    </main>
  );
}
