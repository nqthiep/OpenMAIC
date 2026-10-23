/**
 * What membership costs. One place, read by the home page and the terms. Prices are in dong, tax
 * included where tax applies. Payment is by bank transfer after a note to the contact address;
 * there is no online checkout yet, so nothing here charges anyone.
 *
 * The figures come from the cost and market study in `plans/khaitam-pricing.md`. Change them
 * there first.
 */
export interface PricingPlan {
  readonly id: 'm1' | 'm6' | 'm12';
  readonly months: number;
  /** The whole price for the period, in dong. */
  readonly price: number;
}

export const PRICING: readonly PricingPlan[] = [
  { id: 'm1', months: 1, price: 99_000 },
  { id: 'm6', months: 6, price: 499_000 },
  { id: 'm12', months: 12, price: 899_000 },
];

/** The monthly plan, which the longer ones are measured against. */
const MONTHLY = PRICING[0]!;

/** How much a plan saves against paying month by month, as a whole percent. */
export function savingPercent(plan: PricingPlan): number {
  return Math.round((1 - plan.price / (MONTHLY.price * plan.months)) * 100);
}

/** An amount of dong written for a reader's language ("99.000 ₫" in Vietnamese). */
export function formatDong(amount: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-US')} VND`;
  }
}
