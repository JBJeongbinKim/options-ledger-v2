import { readAppState, writeAppState } from "./_lib/appStateStore.js";
import { KvUnavailableError } from "./_lib/kvStore.js";

const DEFAULT_LEDGER_STATE = {
  startingNavPoints: 17,
  cashPoints: 17,
  openPositions: [],
  realizedTodayPoints: 0,
  realizedWeekPoints: 0,
};

function jsonReply(status, body, res) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeLedgerState(raw) {
  const parsed = raw && typeof raw === "object" ? raw : {};
  return {
    startingNavPoints:
      typeof parsed.startingNavPoints === "number" && Number.isFinite(parsed.startingNavPoints)
        ? parsed.startingNavPoints
        : DEFAULT_LEDGER_STATE.startingNavPoints,
    cashPoints:
      typeof parsed.cashPoints === "number" && Number.isFinite(parsed.cashPoints)
        ? parsed.cashPoints
        : DEFAULT_LEDGER_STATE.cashPoints,
    openPositions: Array.isArray(parsed.openPositions) ? parsed.openPositions : [],
    realizedTodayPoints:
      typeof parsed.realizedTodayPoints === "number" && Number.isFinite(parsed.realizedTodayPoints)
        ? parsed.realizedTodayPoints
        : 0,
    realizedWeekPoints:
      typeof parsed.realizedWeekPoints === "number" && Number.isFinite(parsed.realizedWeekPoints)
        ? parsed.realizedWeekPoints
        : 0,
  };
}

function normalizeSnapshot(raw) {
  const parsed = raw && typeof raw === "object" ? raw : {};
  const kospi200Value =
    typeof parsed.kospi200Value === "number" && Number.isFinite(parsed.kospi200Value) ? parsed.kospi200Value : undefined;

  return {
    ledgerState: normalizeLedgerState(parsed.ledgerState),
    ...(kospi200Value === undefined ? {} : { kospi200Value }),
  };
}

async function readBody(req) {
  if (typeof req?.json === "function") {
    const parsed = await req.json().catch(() => ({}));
    return parsed ?? {};
  }

  return req?.body ?? {};
}

export default async function handler(req, res) {
  try {
    const method = req?.method || "GET";

    if (method === "GET") {
      const snapshot = normalizeSnapshot(await readAppState());
      return jsonReply(200, snapshot, res);
    }

    if (method === "PUT") {
      const body = await readBody(req);
      const snapshot = normalizeSnapshot(body);
      await writeAppState(snapshot);
      return jsonReply(200, { ok: true, snapshot }, res);
    }

    return jsonReply(405, { error: "Method Not Allowed" }, res);
  } catch (error) {
    if (error instanceof KvUnavailableError) {
      return jsonReply(503, { error: error.message }, res);
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonReply(500, { error: message }, res);
  }
}
