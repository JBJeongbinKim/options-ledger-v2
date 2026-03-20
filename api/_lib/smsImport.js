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

export function parseIncomingSmsToPendingImport(smsText, sentAt, now = new Date()) {
  const referenceDate = sentAt ? new Date(sentAt) : now;
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? now : referenceDate;
  const normalized = smsText.replace(/\r/g, "");

  const isBuy = /\uB9E4\uC218/i.test(normalized);
  const isSell = /\uB9E4\uB3C4/i.test(normalized);
  if (!isBuy && !isSell) return null;

  const typeMatch = normalized.match(/\b([CP])\b/i);
  const parsedStrike = extractStrikeFromMessage(normalized);
  const qtyMatch = normalized.match(/([0-9,]+)\s*\uACC4\uC57D/i);
  const priceMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*P\b/i);
  if (!typeMatch || parsedStrike === null || !qtyMatch || !priceMatch) return null;

  const parsedQty = Number(qtyMatch[1].replace(/,/g, ""));
  const parsedPrice = Number(priceMatch[1]);
  if (!Number.isFinite(parsedStrike) || !Number.isFinite(parsedQty) || !Number.isFinite(parsedPrice)) return null;

  return {
    id: `imp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    mode: isBuy ? "buy" : "sell",
    underlying: inferUnderlyingFromText(normalized, safeReferenceDate),
    type: typeMatch[1].toUpperCase() === "P" ? "Put" : "Call",
    strike: Math.max(0, Math.round(parsedStrike)),
    qty: Math.max(1, Math.round(parsedQty)),
    price: Math.max(0, parsedPrice),
    sentAt: safeReferenceDate.toISOString(),
    createdAt: now.toISOString(),
  };
}
