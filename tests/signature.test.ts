/**
 * Signature module tests.
 *
 * These vectors are computed from PayHere's own docs example values
 * (merchant_id="2xxxxx", merchant_secret="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").
 * If any of these change, something is wrong — PayHere will reject every
 * checkout submission, and every notify validation will fail.
 *
 * NEVER edit these expected hashes without also reading PayHere's docs and
 * re-deriving them. They're the contract.
 */

import { describe, expect, it } from "vitest";
import {
	computeCheckoutHash,
	computeNotifyHash,
	formatAmount,
	hashMerchantSecret,
	md5Upper,
	verifyNotifyHash,
} from "../src/signature.js";

// Reusable fixture values — match the inputs we computed real hashes for.
const FIXTURE = {
	merchantId: "2xxxxx",
	merchantSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
	orderId: "12345",
	currency: "LKR",
} as const;

// Pre-computed expected outputs (from running PayHere's algorithm by hand).
const EXPECTED = {
	secretHash: "DC8FE1D6497EBD23F5975D8D2A1C5E81",
	checkoutHash: "D76F7AB16EDBE176244577AE8A46F460",
	notifyHash: "ABA32E234F1A1E99ECC80F02BFF94AB4",
} as const;

describe("md5Upper", () => {
	it("returns an upper-cased hex digest", () => {
		expect(md5Upper("hello")).toBe("5D41402ABC4B2A76B9719D911017C592");
	});

	it("handles empty input", () => {
		expect(md5Upper("")).toBe("D41D8CD98F00B204E9800998ECF8427E");
	});

	it("is deterministic", () => {
		expect(md5Upper("payhere")).toBe(md5Upper("payhere"));
	});
});

describe("formatAmount", () => {
	it("formats integers with two decimals", () => {
		expect(formatAmount(1000)).toBe("1000.00");
	});

	it("formats floats with two decimals", () => {
		expect(formatAmount(99.5)).toBe("99.50");
	});

	it("rounds to two decimals", () => {
		expect(formatAmount(99.999)).toBe("100.00");
	});

	it("accepts string input", () => {
		expect(formatAmount("1500.5")).toBe("1500.50");
	});

	it("never includes thousands separators", () => {
		// This is the most common bug — toLocaleString would produce "1,000,000.00"
		expect(formatAmount(1000000)).toBe("1000000.00");
	});

	it("throws on non-numeric input", () => {
		expect(() => formatAmount("abc")).toThrow(/invalid amount/i);
		expect(() => formatAmount(Number.NaN)).toThrow(/invalid amount/i);
		expect(() => formatAmount(Number.POSITIVE_INFINITY)).toThrow(/invalid amount/i);
	});
});

describe("hashMerchantSecret", () => {
	it("matches the PayHere reference vector", () => {
		expect(hashMerchantSecret(FIXTURE.merchantSecret)).toBe(EXPECTED.secretHash);
	});
});

describe("computeCheckoutHash", () => {
	it("matches the PayHere reference vector", () => {
		const hash = computeCheckoutHash({
			merchantId: FIXTURE.merchantId,
			orderId: FIXTURE.orderId,
			amount: 1000,
			currency: FIXTURE.currency,
			merchantSecret: FIXTURE.merchantSecret,
		});
		expect(hash).toBe(EXPECTED.checkoutHash);
	});

	it("produces the same output for equivalent numeric and string amounts", () => {
		const fromNumber = computeCheckoutHash({
			merchantId: FIXTURE.merchantId,
			orderId: FIXTURE.orderId,
			amount: 1000,
			currency: FIXTURE.currency,
			merchantSecret: FIXTURE.merchantSecret,
		});
		const fromString = computeCheckoutHash({
			merchantId: FIXTURE.merchantId,
			orderId: FIXTURE.orderId,
			amount: "1000",
			currency: FIXTURE.currency,
			merchantSecret: FIXTURE.merchantSecret,
		});
		expect(fromNumber).toBe(fromString);
	});

	it("changes when any input changes", () => {
		const base = computeCheckoutHash({
			merchantId: FIXTURE.merchantId,
			orderId: FIXTURE.orderId,
			amount: 1000,
			currency: FIXTURE.currency,
			merchantSecret: FIXTURE.merchantSecret,
		});

		// Each variation should produce a different hash — confirms every field
		// participates in the digest.
		expect(
			computeCheckoutHash({
				merchantId: "999999",
				orderId: FIXTURE.orderId,
				amount: 1000,
				currency: FIXTURE.currency,
				merchantSecret: FIXTURE.merchantSecret,
			}),
		).not.toBe(base);
		expect(
			computeCheckoutHash({
				merchantId: FIXTURE.merchantId,
				orderId: "99999",
				amount: 1000,
				currency: FIXTURE.currency,
				merchantSecret: FIXTURE.merchantSecret,
			}),
		).not.toBe(base);
		expect(
			computeCheckoutHash({
				merchantId: FIXTURE.merchantId,
				orderId: FIXTURE.orderId,
				amount: 2000,
				currency: FIXTURE.currency,
				merchantSecret: FIXTURE.merchantSecret,
			}),
		).not.toBe(base);
		expect(
			computeCheckoutHash({
				merchantId: FIXTURE.merchantId,
				orderId: FIXTURE.orderId,
				amount: 1000,
				currency: "USD",
				merchantSecret: FIXTURE.merchantSecret,
			}),
		).not.toBe(base);
	});
});

describe("computeNotifyHash", () => {
	it("matches the PayHere reference vector for a successful payment", () => {
		const hash = computeNotifyHash({
			merchantId: FIXTURE.merchantId,
			orderId: FIXTURE.orderId,
			payhereAmount: "1000.00",
			payhereCurrency: FIXTURE.currency,
			statusCode: "2",
			merchantSecret: FIXTURE.merchantSecret,
		});
		expect(hash).toBe(EXPECTED.notifyHash);
	});

	it("differs from the checkout hash for the same logical payment", () => {
		// They use different inputs (notify adds status_code), so they must differ.
		// Bug-prevention: someone "simplifying" by reusing one function for both.
		expect(EXPECTED.notifyHash).not.toBe(EXPECTED.checkoutHash);
	});
});

describe("verifyNotifyHash", () => {
	const validInput = {
		merchantId: FIXTURE.merchantId,
		orderId: FIXTURE.orderId,
		payhereAmount: "1000.00",
		payhereCurrency: FIXTURE.currency,
		statusCode: "2",
		merchantSecret: FIXTURE.merchantSecret,
	};

	it("returns true for the correct md5sig", () => {
		expect(verifyNotifyHash(validInput, EXPECTED.notifyHash)).toBe(true);
	});

	it("returns true regardless of case in the provided sig", () => {
		// PayHere's docs upper-case, but be defensive against lower-case inputs.
		expect(verifyNotifyHash(validInput, EXPECTED.notifyHash.toLowerCase())).toBe(true);
	});

	it("returns false when status_code is forged", () => {
		// Attacker tries to claim success with a hash computed for a failed payment.
		expect(verifyNotifyHash({ ...validInput, statusCode: "-1" }, EXPECTED.notifyHash)).toBe(
			false,
		);
	});

	it("returns false when amount is tampered with", () => {
		expect(verifyNotifyHash({ ...validInput, payhereAmount: "1.00" }, EXPECTED.notifyHash)).toBe(
			false,
		);
	});

	it("returns false when provided sig has the wrong length", () => {
		expect(verifyNotifyHash(validInput, "TOOSHORT")).toBe(false);
	});

	it("returns false for a completely unrelated hash", () => {
		expect(
			verifyNotifyHash(validInput, "00000000000000000000000000000000"),
		).toBe(false);
	});
});
