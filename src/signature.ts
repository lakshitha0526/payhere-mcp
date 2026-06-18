/**
 * PayHere signature helpers.
 *
 * PayHere uses MD5-based hashes in two related but distinct places:
 *
 *   1. CHECKOUT — when submitting an order to /pay/checkout, the merchant
 *      computes a hash over (merchant_id, order_id, amount, currency, secret).
 *      The gateway re-computes the same hash on its side and rejects mismatches.
 *
 *   2. NOTIFY — when PayHere POSTs the payment result back to the merchant's
 *      notify_url, it includes an `md5sig` field. The merchant must recompute
 *      it locally to prove the callback is authentic (i.e. wasn't spoofed by
 *      a third party hitting the public notify endpoint directly).
 *
 * Both flows go through a "secret hash" intermediate: md5(merchantSecret) upper-cased.
 * The amount format is strict: always two decimal places, no thousands separators.
 *
 * Refs:
 *  - https://support.payhere.lk/api-&-mobile-sdk/checkout-api  (checkout hash)
 *  - https://support.payhere.lk/api-&-mobile-sdk/checkout-api  (notify md5sig)
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** MD5 a string and return the upper-cased hex digest. */
export function md5Upper(input: string): string {
	return createHash("md5").update(input, "utf8").digest("hex").toUpperCase();
}

/**
 * Format an amount the way PayHere expects: exactly two decimal places,
 * no thousands separators. Accepts either a number or a numeric string.
 *
 * Why this matters: "1000" vs "1,000.00" vs "1000.00" all hash to different
 * values. The gateway only accepts the last form, so getting this wrong is
 * the #1 cause of "hash mismatch" errors in PayHere integrations.
 */
export function formatAmount(amount: number | string): string {
	const num = typeof amount === "string" ? Number(amount) : amount;
	if (!Number.isFinite(num)) {
		throw new Error(`Invalid amount for hash: ${amount}`);
	}
	return num.toFixed(2);
}

/** md5(merchantSecret) upper-cased — the inner hash used by both variants. */
export function hashMerchantSecret(merchantSecret: string): string {
	return md5Upper(merchantSecret);
}

export interface CheckoutHashInput {
	merchantId: string;
	orderId: string;
	amount: number | string;
	currency: string;
	merchantSecret: string;
}

/**
 * Compute the checkout submission hash.
 *
 * Formula:
 *   hash = upper(md5(
 *     merchant_id + order_id + formatted_amount + currency + upper(md5(merchant_secret))
 *   ))
 */
export function computeCheckoutHash(input: CheckoutHashInput): string {
	const secretHash = hashMerchantSecret(input.merchantSecret);
	const amount = formatAmount(input.amount);
	return md5Upper(input.merchantId + input.orderId + amount + input.currency + secretHash);
}

export interface NotifyHashInput {
	merchantId: string;
	orderId: string;
	/** PayHere sends this as `payhere_amount` in the notify POST. */
	payhereAmount: string;
	/** PayHere sends this as `payhere_currency` in the notify POST. */
	payhereCurrency: string;
	/** PayHere sends this as `status_code` (e.g. "2" = success, "0" = pending, "-1" = canceled, "-2" = failed, "-3" = chargedback). */
	statusCode: string;
	merchantSecret: string;
}

/**
 * Compute the notify URL signature (PayHere's `md5sig` field).
 *
 * Formula:
 *   md5sig = upper(md5(
 *     merchant_id + order_id + payhere_amount + payhere_currency + status_code + upper(md5(merchant_secret))
 *   ))
 *
 * Note: payhere_amount comes from the POST body as a string ("1000.00") and
 * should be used as-is rather than re-formatted — PayHere's value is the
 * authoritative one we're verifying against.
 */
export function computeNotifyHash(input: NotifyHashInput): string {
	const secretHash = hashMerchantSecret(input.merchantSecret);
	return md5Upper(
		input.merchantId +
			input.orderId +
			input.payhereAmount +
			input.payhereCurrency +
			input.statusCode +
			secretHash,
	);
}

/**
 * Verify a notify URL signature by recomputing it and constant-time comparing.
 *
 * Returns true if the provided md5sig matches what we'd compute locally —
 * i.e. the notify payload is authentic and untampered.
 */
export function verifyNotifyHash(
	input: NotifyHashInput,
	providedMd5Sig: string,
): boolean {
	const expected = computeNotifyHash(input);
	return timingSafeEqualHex(expected, providedMd5Sig.toUpperCase());
}

/**
 * Constant-time equality check for two same-length hex strings.
 *
 * Plain `===` leaks timing information on signature checks. crypto.timingSafeEqual
 * requires equal-length Buffers, so we guard the length first to avoid throwing.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	return timingSafeEqual(bufA, bufB);
}
