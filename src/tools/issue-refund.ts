/**
 * Tool: issue_refund
 *
 * Refunds a payment by payment_id, either fully or with a partial amount.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereApi } from "../api.js";

/** Shape of an MCP tool result with text content and an optional error flag. */
type McpToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

/**
 * Pure handler for issue_refund — separated from registration for direct
 * unit-testing with a mocked PayHereApi. Forwards args straight to the API
 * client; amount formatting (2dp) happens inside api.refundPayment.
 */
export async function handleIssueRefund(
	api: PayHereApi,
	args: { paymentId: string; description: string; amount?: number },
): Promise<McpToolResult> {
	try {
		const result = await api.refundPayment(args);
		return jsonResult(result);
	} catch (err) {
		return errorResult(err);
	}
}

export function registerIssueRefund(server: McpServer, api: PayHereApi): void {
	server.registerTool(
		"issue_refund",
		{
			title: "Issue a PayHere refund",
			description:
				"Refunds a payment by payment_id. Omit `amount` for a full refund, " +
				"or set it for a partial refund. Returns the PayHere refund status.",
			inputSchema: {
				paymentId: z.string().min(1).describe("PayHere payment_id (from get_payment or notify)"),
				description: z
					.string()
					.min(1)
					.describe("Reason / note for the refund — visible to the merchant"),
				amount: z
					.number()
					.positive()
					.optional()
					.describe("Partial refund amount. Omit for a full refund."),
			},
		},
		(args) => handleIssueRefund(api, args),
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
