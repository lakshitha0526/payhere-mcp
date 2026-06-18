/**
 * PayHere REST client tests.
 *
 * Both the global `fetch` and the AuthClient are mocked — no network, no real
 * tokens. Covers envelope unwrapping, request shaping, passthrough parsing,
 * the error contract, and that the Bearer token never leaks into errors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPayHereApi } from "../src/api.js";
import type { AuthClient } from "../src/auth.js";
import type { PayHereConfig } from "../src/config.js";

// Distinctive token value we can grep error messages for — it must never
// surface in anything the client throws.
const TOKEN_CANARY = "TOKEN_LEAK_CANARY";

const config: PayHereConfig = {
	mode: "sandbox",
	merchantId: "merchant-id",
	merchantSecret: "merchant-secret",
	appId: "app-id",
	appSecret: "app-secret",
	baseUrl: "https://sandbox.payhere.lk/merchant/v1",
	checkoutUrl: "https://sandbox.payhere.lk/pay/checkout",
};

const SEARCH_BASE = "https://sandbox.payhere.lk/merchant/v1/payment/search";
const REFUND_URL = "https://sandbox.payhere.lk/merchant/v1/payment/refund";

const PAYMENT: PaymentFixture = {
	payment_id: "PAY1",
	order_id: "ORD1",
	date: "2026-06-18 10:00:00",
	description: "Order ORD1",
	status: "RECEIVED",
	currency: "LKR",
	amount: 1000,
};

interface PaymentFixture {
	payment_id: string;
	order_id: string;
	date: string;
	description?: string;
	status: string;
	currency: string;
	amount: number;
	[key: string]: unknown;
}

/** Build a minimal fetch Response stand-in for the mock. */
function makeResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
	};
}

/** Wrap a payload in PayHere's success envelope. */
function envelope(data: unknown, status = 1, msg = "ok") {
	return makeResponse({ status, msg, data });
}

let fetchMock: ReturnType<typeof vi.fn>;
let getAccessToken: ReturnType<typeof vi.fn>;
let auth: AuthClient;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	getAccessToken = vi.fn().mockResolvedValue(TOKEN_CANARY);
	auth = { getAccessToken, getCachedTokenExpiry: () => null };
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("getPaymentsByOrderId", () => {
	it("requests the search endpoint with a URL-encoded order_id and Bearer token", async () => {
		fetchMock.mockResolvedValue(envelope([PAYMENT]));
		const api = createPayHereApi(config, auth);

		const records = await api.getPaymentsByOrderId("ORD#12 34");

		expect(records).toEqual([PAYMENT]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${SEARCH_BASE}?order_id=ORD%2312%2034`);
		expect(init?.method).toBe("GET");
		expect(init?.headers.Authorization).toBe(`Bearer ${TOKEN_CANARY}`);
		expect(init?.headers.Accept).toBe("application/json");
	});

	it("returns every payment attempt when an order has more than one", async () => {
		const second = { ...PAYMENT, payment_id: "PAY2", status: "REFUNDED" };
		fetchMock.mockResolvedValue(envelope([PAYMENT, second]));
		const api = createPayHereApi(config, auth);

		const records = await api.getPaymentsByOrderId("ORD1");

		expect(records).toHaveLength(2);
		expect(records[1]?.payment_id).toBe("PAY2");
	});

	it("passes through PayHere fields not present in the schema", async () => {
		const enriched = {
			...PAYMENT,
			card_holder_name: "S. Perera",
			amount_detail: { gross: "1000.00", fee: "33.00" },
		};
		fetchMock.mockResolvedValue(envelope([enriched]));
		const api = createPayHereApi(config, auth);

		const records = await api.getPaymentsByOrderId("ORD1");

		expect(records[0]?.card_holder_name).toBe("S. Perera");
		expect(records[0]?.amount_detail).toEqual({ gross: "1000.00", fee: "33.00" });
	});
});

describe("refundPayment", () => {
	it("sends only payment_id and description for a full refund", async () => {
		fetchMock.mockResolvedValue(envelope({ status: 1, msg: "Refunded", payment_id: "PAY1" }));
		const api = createPayHereApi(config, auth);

		const result = await api.refundPayment({
			paymentId: "PAY1",
			description: "Customer request",
		});

		expect(result).toEqual({ status: 1, msg: "Refunded", payment_id: "PAY1" });

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(REFUND_URL);
		expect(init?.method).toBe("POST");
		expect(init?.headers["Content-Type"]).toBe("application/json");
		expect(init?.headers.Authorization).toBe(`Bearer ${TOKEN_CANARY}`);
		expect(JSON.parse(init?.body)).toEqual({
			payment_id: "PAY1",
			description: "Customer request",
		});
	});

	it("includes a 2dp-formatted amount for a partial refund", async () => {
		fetchMock.mockResolvedValue(envelope({ status: 1, msg: "Refunded", payment_id: "PAY1" }));
		const api = createPayHereApi(config, auth);

		await api.refundPayment({
			paymentId: "PAY1",
			description: "Partial",
			amount: 100.5,
		});

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(JSON.parse(init?.body)).toEqual({
			payment_id: "PAY1",
			description: "Partial",
			amount: "100.50",
		});
	});
});

describe("error handling", () => {
	it("throws with the envelope status and msg when status is not 1", async () => {
		fetchMock.mockResolvedValue(makeResponse({ status: 0, msg: "No such order", data: null }));
		const api = createPayHereApi(config, auth);

		await expect(api.getPaymentsByOrderId("ORD1")).rejects.toThrow(
			"PayHere API error (status=0): No such order",
		);
	});

	it("throws with status code and body on a non-2xx response", async () => {
		fetchMock.mockResolvedValue(makeResponse("Unauthorized", 401));
		const api = createPayHereApi(config, auth);

		await expect(api.getPaymentsByOrderId("ORD1")).rejects.toThrow(
			"PayHere API failed (401): Unauthorized",
		);
	});

	it("rethrows network failures with a network error prefix", async () => {
		fetchMock.mockRejectedValue(new Error("ECONNRESET"));
		const api = createPayHereApi(config, auth);

		await expect(api.getPaymentsByOrderId("ORD1")).rejects.toThrow(
			"PayHere API network error: ECONNRESET",
		);
	});

	it("throws on a malformed envelope (data missing)", async () => {
		fetchMock.mockResolvedValue(makeResponse({ status: 1, msg: "ok" }));
		const api = createPayHereApi(config, auth);

		await expect(api.getPaymentsByOrderId("ORD1")).rejects.toThrow(
			"PayHere API returned unexpected response shape",
		);
	});

	it("propagates auth errors unwrapped (no API prefix, no fetch)", async () => {
		getAccessToken.mockRejectedValue(new Error("PayHere auth failed (401): bad creds"));
		const api = createPayHereApi(config, auth);

		await expect(api.getPaymentsByOrderId("ORD1")).rejects.toThrow(
			"PayHere auth failed (401): bad creds",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("never leaks the access token into any thrown error message", async () => {
		const scenarios: Array<() => void> = [
			() => fetchMock.mockResolvedValue(makeResponse("Unauthorized", 401)),
			() => fetchMock.mockRejectedValue(new Error("ECONNRESET")),
			() => fetchMock.mockResolvedValue(makeResponse({ status: 0, msg: "denied", data: null })),
			() => fetchMock.mockResolvedValue(makeResponse({ status: 1, msg: "ok" })),
		];

		const messages: string[] = [];
		for (const setup of scenarios) {
			fetchMock.mockReset();
			setup();
			const api = createPayHereApi(config, auth);
			try {
				await api.getPaymentsByOrderId("ORD1");
				throw new Error("expected getPaymentsByOrderId to reject");
			} catch (err) {
				messages.push(err instanceof Error ? err.message : String(err));
			}
		}

		for (const message of messages) {
			expect(message).not.toContain(TOKEN_CANARY);
		}
	});
});
