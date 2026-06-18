/**
 * Tool: issue_refund
 *
 * Refunds a payment by payment_id, either fully or with a partial amount.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereApi } from "../api.js";

export function registerIssueRefund(server: McpServer, _api: PayHereApi): void {
	server.registerTool(
		"issue_refund",
		{
			title: "Issue a PayHere refund",
			description:
				"Refunds a payment by payment_id. Omit `amount` for a full refund, " +
				"or set it for a partial refund. Returns the PayHere refund status.",
			inputSchema: {
				paymentId: z.string().min(1).describe("PayHere payment_id (from get_payment or notify)"),
				description: z.string().min(1).describe("Reason / note for the refund — visible to the merchant"),
				amount: z
					.number()
					.positive()
					.optional()
					.describe("Partial refund amount. Omit for a full refund."),
			},
		},
		async (_args) => ({
			content: [
				{
					type: "text",
					text: "issue_refund not implemented yet — coming in the next pass.",
				},
			],
			isError: true,
		}),
	);
}
