/**
 * Tests for the get_payment tool handler.
 *
 * Drives the pure handleGetPayment function with a mocked PayHereApi — no MCP
 * server, no HTTP. Covers single/multiple attempts, the empty-order note, and
 * the error → isError contract.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayHereApi, PaymentRecord } from "../../src/api.js";
import { handleGetPayment } from "../../src/tools/get-payment.js";

const PAYMENT: PaymentRecord = {
	payment_id: "PAY1",
	order_id: "ORD1",
	date: "2026-06-18 10:00:00",
	description: "Order ORD1",
	status: "RECEIVED",
	currency: "LKR",
	amount: 1000,
};

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function parseText(result: ToolResult): Record<string, unknown> {
	const first = result.content[0];
	if (!first) throw new Error("expected tool result content");
	return JSON.parse(first.text);
}

let getPaymentsByOrderId: ReturnType<typeof vi.fn>;
let api: PayHereApi;

beforeEach(() => {
	getPaymentsByOrderId = vi.fn();
	api = {
		getPaymentsByOrderId,
		refundPayment: vi.fn(),
	};
});

describe("handleGetPayment", () => {
	it("returns the order id and a single attempt", async () => {
		getPaymentsByOrderId.mockResolvedValue([PAYMENT]);

		const result = await handleGetPayment(api, { orderId: "ORD1" });

		expect(getPaymentsByOrderId).toHaveBeenCalledWith("ORD1");
		expect(result.isError).toBeUndefined();
		const payload = parseText(result);
		expect(payload.orderId).toBe("ORD1");
		expect(payload.attempts).toEqual([PAYMENT]);
		expect(payload.note).toBeUndefined();
	});

	it("returns all attempts when an order has more than one", async () => {
		const second = { ...PAYMENT, payment_id: "PAY2", status: "REFUNDED" };
		getPaymentsByOrderId.mockResolvedValue([PAYMENT, second]);

		const result = await handleGetPayment(api, { orderId: "ORD1" });

		const payload = parseText(result);
		expect(payload.attempts).toHaveLength(2);
	});

	it("returns success with an empty array and a note when nothing is found", async () => {
		getPaymentsByOrderId.mockResolvedValue([]);

		const result = await handleGetPayment(api, { orderId: "ORD404" });

		expect(result.isError).toBeUndefined();
		const payload = parseText(result);
		expect(payload.attempts).toEqual([]);
		expect(payload.note).toBe("No payments found for this order_id.");
	});

	it("reports API failures as an error result rather than throwing", async () => {
		getPaymentsByOrderId.mockRejectedValue(new Error("PayHere API failed (401): Unauthorized"));

		const result = await handleGetPayment(api, { orderId: "ORD1" });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe("PayHere API failed (401): Unauthorized");
	});
});
