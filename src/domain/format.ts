import { POINT_TO_KRW } from "./ledger";

const pointsFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPoints(value: number): string {
  return pointsFormatter.format(value);
}

export function formatSignedPoints(value: number): string {
  if (value > 0) return `+${formatPoints(value)}`;
  return formatPoints(value);
}

export function formatKrwFromPoints(points: number, signed = false): string {
  const krw = Math.round(points * POINT_TO_KRW);
  const abs = `\u20A9${krwFormatter.format(Math.abs(krw))}`;
  if (!signed) {
    return krw < 0 ? `-${abs}` : abs;
  }
  if (krw > 0) return `+${abs}`;
  if (krw < 0) return `-${abs}`;
  return abs;
}
