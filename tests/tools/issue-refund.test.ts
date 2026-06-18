/**
 * Tests for the issue_refund tool handler.
 *
 * Drives the pure handleIssueRefund function with a mocked PayHereApi. Covers
 * full vs partial refund argument forwarding and the error → isError contract.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayHereApi } from "../../src/api.js";
import { handleIssueRefund } from "../../src/tools/issue-refund.js";

const REFUND_OK = { status: 1, msg: "Successfully processed the refund", data: "560034237057" };

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function parseText(result: ToolResult): Record<string, unknown> {
	const first = result.content[0];
	if (!first) throw new Error("expected tool result content");
	return JSON.parse(first.text);
}

let refundPayment: ReturnType<typeof vi.fn>;
let api: PayHereApi;

beforeEach(() => {
	refundPayment = vi.fn();
	api = {
		getPaymentsByOrderId: vi.fn(),
		refundPayment,
	};
});

describe("handleIssueRefund", () => {
	it("forwards a full refund (no amount) and returns the refund result", async () => {
		refundPayment.mockResolvedValue(REFUND_OK);

		const result = await handleIssueRefund(api, {
			paymentId: "PAY1",
			description: "Customer request",
		});

		expect(refundPayment).toHaveBeenCalledWith({
			paymentId: "PAY1",
			description: "Customer request",
		});
		expect(result.isError).toBeUndefined();
		expect(parseText(result)).toEqual(REFUND_OK);
	});

	it("forwards a partial refund with an amount", async () => {
		refundPayment.mockResolvedValue(REFUND_OK);

		await handleIssueRefund(api, {
			paymentId: "PAY1",
			description: "Partial",
			amount: 250.5,
		});

		expect(refundPayment).toHaveBeenCalledWith({
			paymentId: "PAY1",
			description: "Partial",
			amount: 250.5,
		});
	});

	it("reports API failures as an error result rather than throwing", async () => {
		refundPayment.mockRejectedValue(new Error("PayHere API error (status=0): refund declined"));

		const result = await handleIssueRefund(api, {
			paymentId: "PAY1",
			description: "Customer request",
		});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe("PayHere API error (status=0): refund declined");
	});
});
