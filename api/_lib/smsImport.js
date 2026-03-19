function buildReferenceDate(sentAt, now = new Date()) {
  const referenceDate = sentAt ? new Date(sentAt) : now;
  return Number.isNaN(referenceDate.getTime()) ? now : referenceDate;
}

function inferUnderlyingFromText(message, referenceDate) {
  if (/\uCF54\uC2A4\uD53C\uC704\uD074\uB9ACM/i.test(message)) return "Mon";
  if (/\uCF54\uC2A4\uD53C\uC704\uD074\uB9AC/i.test(message)) return "Thu";
  if (/\uCF54\uC2A4\uD53C200/i.test(message)) return "Month";
  const fallbackDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const day = fallbackDate.getDay();
  const hour = fallbackDate.getHours();
  const inMonWindow = (day === 4 && hour >= 5) || day === 5 || day === 6 || day === 0 || (day === 1 && hour < 5);
  return inMonWindow ? "Mon" : "Thu";
}

function extractStrikeFromMessage(normalized) {
  const optionLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /\b[CP]\b/i.test(line));

  if (!optionLine) return null;

  const numberMatches = [...optionLine.matchAll(/([0-9]+(?:\.[0-9]+)?)/g)];
  const lastNumber = numberMatches[numberMatches.length - 1]?.[1];
  return lastNumber ? Number(lastNumber) : null;
}

export function inspectIncomingSmsParse(smsText, sentAt, now = new Date()) {
  const safeReferenceDate = buildReferenceDate(sentAt, now);
  const normalized = smsText.replace(/\r/g, "");

  const isBuy = /\uB9E4\uC218/i.test(normalized);
  const isSell = /\uB9E4\uB3C4/i.test(normalized);
  const typeMatch = normalized.match(/\b([CP])\b/i);
  const parsedStrike = extractStrikeFromMessage(normalized);
  const qtyMatch = normalized.match(/([0-9,]+)\s*\uACC4\uC57D/i);
  const priceMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*P\b/i);
  const underlying = inferUnderlyingFromText(normalized, safeReferenceDate);

  return {
    normalized,
    sentAt: safeReferenceDate.toISOString(),
    mode: isBuy ? "buy" : isSell ? "sell" : null,
    underlying,
    matches: {
      type: typeMatch?.[1]?.toUpperCase() ?? null,
      strike: parsedStrike,
      qty: qtyMatch?.[1] ?? null,
      price: priceMatch?.[1] ?? null,
    },
  };
}

export function parseIncomingSmsToPendingImport(smsText, sentAt, now = new Date()) {
  const inspection = inspectIncomingSmsParse(smsText, sentAt, now);
  if (!inspection.mode) return null;
  const { matches } = inspection;
  if (!matches.type || matches.strike === null || !matches.qty || !matches.price) return null;

  const parsedQty = Number(matches.qty.replace(/,/g, ""));
  const parsedPrice = Number(matches.price);
  if (!Number.isFinite(matches.strike) || !Number.isFinite(parsedQty) || !Number.isFinite(parsedPrice)) return null;

  return {
    id: `imp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    mode: inspection.mode,
    underlying: inspection.underlying,
    type: matches.type === "P" ? "Put" : "Call",
    strike: Math.max(0, Math.round(matches.strike)),
    qty: Math.max(1, Math.round(parsedQty)),
    price: Math.max(0, parsedPrice),
    sentAt: inspection.sentAt,
    createdAt: now.toISOString(),
  };
}
