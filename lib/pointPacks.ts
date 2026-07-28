// Single source of truth for point-pack pricing.
//
// Why this exists (#39): pack pricing lived in `POINT_PACKS` in
// app/(dashboard)/points/page.tsx, while `SUBSCRIPTION_FEATURES.pointPackDiscount`
// in lib/subscriptionFeatures.ts carried a *separate*, hardcoded "10% / 30%".
// Neither derived from the other, so "the discount" depended on which constant
// the surrounding code happened to read, and they disagreed.
//
// The real prices are the only thing a customer experiences, so they're the
// source here — every discount figure is computed from them. Do not reintroduce
// a standalone discount percentage; derive it with the helpers below.
//
// NOTE on the "30% off" labels: those are relative to an implicit list price
// nobody is charged (Enterprise list $600 → Scale $420 = 30%). What a customer
// actually saves by being on Scale is `scaleSavingsVsGrowthPct`, which ranges
// 10–17.6%. See #41 — marketing copy claiming a flat 30% is inaccurate.

export interface PointPack {
  name: string;
  points: number;
  /** What a Growth-tier customer pays. */
  basePrice: number;
  /** What a Scale-tier customer pays. */
  premiumPrice: number;
  popular?: boolean;
}

export const POINT_PACKS: PointPack[] = [
  { name: 'Starter', points: 4000, basePrice: 40, premiumPrice: 36 },
  { name: 'Pro', points: 10000, basePrice: 95, premiumPrice: 80, popular: true },
  { name: 'Business', points: 25000, basePrice: 225, premiumPrice: 180 },
  { name: 'Enterprise', points: 60000, basePrice: 510, premiumPrice: 382.5 },
];

/** What a given tier pays for a pack. */
export function priceFor(pack: PointPack, tier: 'growth' | 'scale'): number {
  return tier === 'scale' ? pack.premiumPrice : pack.basePrice;
}

/**
 * The honest number: what a Scale customer saves on this pack compared to what
 * a Growth customer actually pays. This is the figure to show when comparing
 * plans — not a discount off an unpublished list price.
 */
export function scaleSavingsVsGrowthPct(pack: PointPack): number {
  if (!pack.basePrice) return 0;
  return ((pack.basePrice - pack.premiumPrice) / pack.basePrice) * 100;
}

/** Best saving available on any pack, rounded down. Use for "up to X%" copy. */
export function maxScaleSavingsPct(): number {
  return Math.floor(Math.max(...POINT_PACKS.map(scaleSavingsVsGrowthPct)));
}

/** Smallest saving on any pack, rounded down. Pair with the max for a range. */
export function minScaleSavingsPct(): number {
  return Math.floor(Math.min(...POINT_PACKS.map(scaleSavingsVsGrowthPct)));
}

/** e.g. "10–17%" — accurate phrasing for plan-comparison surfaces. */
export function scaleSavingsRangeLabel(): string {
  const min = minScaleSavingsPct();
  const max = maxScaleSavingsPct();
  return min === max ? `${max}%` : `${min}–${max}%`;
}
