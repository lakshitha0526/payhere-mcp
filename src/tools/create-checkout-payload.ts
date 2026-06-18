/**
 * Tool: create_checkout_payload
 *
 * Returns everything needed to submit a PayHere checkout form: the action URL,
 * the full set of form fields (including the computed hash), and an optional
 * pre-built HTML snippet for quick paste-and-test workflows.
 *
 * This is the most commonly-used tool — every PayHere integration starts here.
 *
 * TODO: implement. The signature module is ready, so this is mostly plumbing:
 *   1. Parse + validate inputs
 *   2. Call computeCheckoutHash from signature.ts
 *   3. Assemble form fields object
 *   4. Optionally render HTML
 *   5. Return as MCP tool result
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereConfig } from "../config.js";

export function registerCreateCheckoutPayload(server: McpServer, _config: PayHereConfig): void {
	server.registerTool(
		"create_checkout_payload",
		{
			title: "Create PayHere checkout payload",
			description:
				"Generates the form data needed to POST a checkout request to PayHere, " +
				"including the MD5 hash. Returns action URL, form fields, and an HTML snippet.",
			inputSchema: {
				orderId: z.string().min(1).describe("Unique order identifier for this payment"),
				amount: z.number().positive().describe("Payment amount (will be formatted to 2dp)"),
				currency: z
					.string()
					.length(3)
					.describe("ISO 4217 currency code, e.g. LKR, USD"),
				items: z.string().min(1).describe("Item description shown on the checkout page"),
				customer: z.object({
					firstName: z.string(),
					lastName: z.string(),
					email: z.string().email(),
					phone: z.string(),
					address: z.string(),
					city: z.string(),
					country: z.string().default("Sri Lanka"),
				}),
				returnUrl: z.string().url().describe("URL to redirect to after successful payment"),
				cancelUrl: z.string().url().describe("URL to redirect to if payment is cancelled"),
				notifyUrl: z
					.string()
					.url()
					.describe("Public URL PayHere will POST the payment result to"),
			},
		},
		async (_args) => ({
			content: [
				{
					type: "text",
					text: "create_checkout_payload not implemented yet — coming in the next pass.",
				},
			],
			isError: true,
		}),
	);
}
