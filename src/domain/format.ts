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

export function formatKrwFromPoints(points: number): string {
  const krw = points * POINT_TO_KRW;
  return `\u20A9${krwFormatter.format(Math.round(krw))}`;
}
