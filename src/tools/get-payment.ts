/**
 * Tool: get_payment
 *
 * Retrieves all payment attempts for a given order_id. PayHere's Retrieval API
 * returns an array because one order can have multiple attempts (failed,
 * retried, refunded, chargedback).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereApi, PaymentRecord } from "../api.js";

interface GetPaymentResult {
	orderId: string;
	attempts: PaymentRecord[];
	note?: string;
}

/** Shape of an MCP tool result with text content and an optional error flag. */
type McpToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

/**
 * Pure handler for get_payment — kept separate from registration so it can be
 * unit-tested with a mocked PayHereApi, no MCP server required.
 *
 * An order with zero attempts is a successful (not error) result: it's a
 * legitimate "nothing found yet" answer, flagged with an explanatory note.
 */
export async function handleGetPayment(
	api: PayHereApi,
	args: { orderId: string },
): Promise<McpToolResult> {
	try {
		const attempts = await api.getPaymentsByOrderId(args.orderId);
		const result: GetPaymentResult = { orderId: args.orderId, attempts };
		if (attempts.length === 0) {
			result.note = "No payments found for this order_id.";
		}
		return jsonResult(result);
	} catch (err) {
		return errorResult(err);
	}
}

export function registerGetPayment(server: McpServer, api: PayHereApi): void {
	server.registerTool(
		"get_payment",
		{
			title: "Get PayHere payment(s) by order ID",
			description:
				"Returns all payment attempts (success, refunded, chargedback) " +
				"associated with the given order_id. PayHere does not support listing " +
				"by date range or status — only by order_id.",
			inputSchema: {
				orderId: z.string().min(1).describe("The order_id used when initiating the payment"),
			},
		},
		(args) => handleGetPayment(api, args),
	);
}

function jsonResult(data: unknown): McpToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
	};
}

function errorResult(err: unknown): McpToolResult {
	return {
		content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
		isError: true,
	};
}
