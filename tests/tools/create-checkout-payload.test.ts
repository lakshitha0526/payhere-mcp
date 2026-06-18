/**
 * Tests for the create_checkout_payload tool.
 *
 * These exercise the pure `buildCheckoutPayload` assembly function directly,
 * so we never have to stand up an MCP server. The hash assertion reuses the
 * locked PayHere checkout vector from tests/signature.test.ts — if it ever
 * changes here, the gateway contract is broken.
 */

import { describe, expect, it } from "vitest";
import type { PayHereConfig } from "../../src/config.js";
import {
	type CheckoutArgs,
	buildCheckoutPayload,
} from "../../src/tools/create-checkout-payload.js";

// PayHere docs placeholder credentials — same fixture as tests/signature.test.ts.
const FIXTURE = {
	merchantId: "2xxxxx",
	merchantSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
	orderId: "12345",
	currency: "LKR",
} as const;

// Locked checkout vector (order=12345, amount=1000.00, currency=LKR).
const EXPECTED_CHECKOUT_HASH = "D76F7AB16EDBE176244577AE8A46F460";

const SANDBOX_CHECKOUT_URL = "https://sandbox.payhere.lk/pay/checkout";

const sandboxConfig: PayHereConfig = {
	mode: "sandbox",
	merchantId: FIXTURE.merchantId,
	merchantSecret: FIXTURE.merchantSecret,
	appId: "app-id",
	appSecret: "app-secret",
	baseUrl: "https://sandbox.payhere.lk/merchant/v1",
	checkoutUrl: SANDBOX_CHECKOUT_URL,
};

const args: CheckoutArgs = {
	orderId: FIXTURE.orderId,
	amount: 1000,
	currency: FIXTURE.currency,
	items: "Test Order",
	customer: {
		firstName: "Saman",
		lastName: "Perera",
		email: "saman@example.com",
		phone: "+94771234567",
		address: "No. 1, Galle Road",
		city: "Colombo",
		country: "Sri Lanka",
	},
	returnUrl: "https://example.com/return",
	cancelUrl: "https://example.com/cancel",
	notifyUrl: "https://example.com/notify",
};

const REQUIRED_FIELDS = [
	"merchant_id",
	"return_url",
	"cancel_url",
	"notify_url",
	"order_id",
	"items",
	"currency",
	"amount",
	"first_name",
	"last_name",
	"email",
	"phone",
	"address",
	"city",
	"country",
	"hash",
] as const;

describe("buildCheckoutPayload", () => {
	it("computes the locked PayHere checkout hash", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.fields.hash).toBe(EXPECTED_CHECKOUT_HASH);
	});

	it("includes every required PayHere form field", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		for (const field of REQUIRED_FIELDS) {
			expect(payload.fields[field], `missing field: ${field}`).toBeTruthy();
		}
	});

	it("uses the sandbox checkout URL as the action_url when mode=sandbox", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.action_url).toBe(SANDBOX_CHECKOUT_URL);
	});

	it("POSTs the form", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.method).toBe("POST");
	});

	it("formats the amount to two decimal places", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.fields.amount).toBe("1000.00");
	});

	it("maps customer details into snake_case fields", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.fields.first_name).toBe("Saman");
		expect(payload.fields.last_name).toBe("Perera");
		expect(payload.fields.email).toBe("saman@example.com");
		expect(payload.fields.merchant_id).toBe(FIXTURE.merchantId);
	});

	it("renders a self-submitting HTML form pointing at the action URL", () => {
		const payload = buildCheckoutPayload(sandboxConfig, args);
		expect(payload.html).toContain(`action="${SANDBOX_CHECKOUT_URL}"`);
		expect(payload.html).toContain(`name="hash" value="${EXPECTED_CHECKOUT_HASH}"`);
		expect(payload.html).toContain(".submit()");
	});

	it("HTML-escapes values so a stray quote can't break out of an attribute", () => {
		const payload = buildCheckoutPayload(sandboxConfig, {
			...args,
			items: 'Widget "Deluxe" <edition>',
		});
		expect(payload.html).toContain("&quot;Deluxe&quot;");
		expect(payload.html).toContain("&lt;edition&gt;");
		// The raw, unescaped form must not appear in the markup.
		expect(payload.html).not.toContain('value="Widget "Deluxe"');
	});

	it("uses the live checkout URL when config is in live mode", () => {
		const liveConfig: PayHereConfig = {
			...sandboxConfig,
			mode: "live",
			checkoutUrl: "https://www.payhere.lk/pay/checkout",
		};
		const payload = buildCheckoutPayload(liveConfig, args);
		expect(payload.action_url).toBe("https://www.payhere.lk/pay/checkout");
	});
});
