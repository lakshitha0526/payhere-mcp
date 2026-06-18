/**
 * Tool: get_payment
 *
 * Retrieves all payment attempts for a given order_id. PayHere's Retrieval API
 * returns an array because one order can have multiple attempts (failed,
 * retried, refunded, chargedback).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereApi } from "../api.js";

export function registerGetPayment(server: McpServer, _api: PayHereApi): void {
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
		async (_args) => ({
			content: [
				{
					type: "text",
					text: "get_payment not implemented yet — coming in the next pass.",
				},
			],
			isError: true,
		}),
	);
}
