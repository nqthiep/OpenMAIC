/**
 * The version of the terms of use and the privacy policy that a sign-up accepts. It is stored with
 * the account, so it must change whenever either text changes in substance: the account then shows
 * which text its owner agreed to. A date, `YYYY-MM-DD`.
 */
export const TERMS_VERSION = '2026-10-23';

/**
 * Whether a lawyer has read the terms and the privacy policy for this service. While false, both
 * pages carry a notice that they are a draft. Set it to true only after that review; the texts in
 * `lib/legal/content` were drafted from what the code does and from the laws as the drafter read
 * them, and they are not legal advice.
 */
export const LEGAL_TEXT_REVIEWED = false;
