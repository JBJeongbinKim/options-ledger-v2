export type PositionType = "Call" | "Put";
export type UnderlyingType = "Mon" | "Thu" | "Month";

export interface PendingServerImport {
  id: string;
  mode: "buy" | "sell";
  underlying: UnderlyingType;
  type: PositionType;
  strike: number;
  qty: number;
  price: number;
  sentAt: string;
  createdAt: string;
}

function resolveWeeklyUnderlyingByTime(referenceDate: Date): UnderlyingType {
  const day = referenceDate.getDay();
  const hour = referenceDate.getHours();
  const inMonWindow = (day === 4 && hour >= 5) || day === 5 || day === 6 || day === 0 || (day === 1 && hour < 5);
  return inMonWindow ? "Mon" : "Thu";
}

function inferUnderlyingFromText(message: string, referenceDate: Date): UnderlyingType {
  if (/\uCF54\uC2A4\uD53C200/i.test(message)) return "Month";
  if (/\uCF54\uC2A4\uD53C\uC704\uD074\uB9AC/i.test(message)) return resolveWeeklyUnderlyingByTime(referenceDate);
  return resolveWeeklyUnderlyingByTime(referenceDate);
}

export function parseIncomingSmsToPendingImport(
  smsText: string,
  sentAt: string | undefined,
  now: Date = new Date(),
): PendingServerImport | null {
  const referenceDate = sentAt ? new Date(sentAt) : now;
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? now : referenceDate;
  const normalized = smsText.replace(/\r/g, "");

  const isBuy = /\uB9E4\uC218/i.test(normalized);
  const isSell = /\uB9E4\uB3C4/i.test(normalized);
  if (!isBuy && !isSell) return null;

  const typeMatch = normalized.match(/\b([CP])\b/i);
  const strikeMatch = normalized.match(/\b[CP]\s+([0-9]+(?:\.[0-9]+)?)/i);
  const qtyMatch = normalized.match(/([0-9,]+)\s*\uACC4\uC57D/i);
  const priceMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*P\b/i);
  if (!typeMatch || !strikeMatch || !qtyMatch || !priceMatch) return null;

  const parsedStrike = Number(strikeMatch[1]);
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
