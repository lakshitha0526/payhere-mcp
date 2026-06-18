/**
 * Tool: generate_signature
 *
 * Exposes the MD5 hash computation used by PayHere for two different cases:
 *
 *   - mode="checkout": the hash a merchant submits with their checkout form
 *   - mode="notify":   the md5sig included in PayHere's notify URL POST,
 *                       which the merchant must verify locally
 *
 * For "notify" mode, callers can either:
 *   (a) Pass `expectedMd5Sig` to get a yes/no verification result, or
 *   (b) Omit it to get the computed hash back for their own comparison.
 *
 * This is the most differentiated tool in v0.1 — every other PayHere
 * integration has to reimplement this logic from scratch, often incorrectly.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereConfig } from "../config.js";
import { computeCheckoutHash, computeNotifyHash, verifyNotifyHash } from "../signature.js";

export function registerGenerateSignature(server: McpServer, config: PayHereConfig): void {
	server.registerTool(
		"generate_signature",
		{
			title: "Generate or verify a PayHere signature",
			description:
				"Computes a PayHere MD5 hash for either checkout submission " +
				"(mode='checkout') or notify URL validation (mode='notify'). " +
				"For notify mode, pass `expectedMd5Sig` to verify an incoming " +
				"signature in one shot. Uses the merchant secret from the server's " +
				"environment — never include the secret in tool arguments.",
			inputSchema: {
				mode: z.enum(["checkout", "notify"]).describe("Which hash variant to compute"),
				merchantId: z
					.string()
					.optional()
					.describe("Merchant ID. Defaults to PAYHERE_MERCHANT_ID env var."),
				orderId: z.string().min(1),
				// Checkout-specific
				amount: z
					.union([z.number().positive(), z.string()])
					.optional()
					.describe("Required for mode='checkout'. Formatted to 2dp internally."),
				currency: z
					.string()
					.length(3)
					.optional()
					.describe("Required for mode='checkout'. ISO 4217 (e.g. LKR)."),
				// Notify-specific
				payhereAmount: z
					.string()
					.optional()
					.describe("Required for mode='notify'. As sent by PayHere."),
				payhereCurrency: z
					.string()
					.optional()
					.describe("Required for mode='notify'. As sent by PayHere."),
				statusCode: z
					.string()
					.optional()
					.describe("Required for mode='notify'. PayHere status_code value."),
				expectedMd5Sig: z
					.string()
					.optional()
					.describe(
						"Optional for mode='notify'. If provided, returns verification result instead of just the hash.",
					),
			},
		},
		async (args) => {
			const merchantId = args.merchantId ?? config.merchantId;
			const merchantSecret = config.merchantSecret;

			if (args.mode === "checkout") {
				if (args.amount === undefined || args.currency === undefined) {
					return errorResult("mode='checkout' requires both `amount` and `currency`.");
				}
				const hash = computeCheckoutHash({
					merchantId,
					orderId: args.orderId,
					amount: args.amount,
					currency: args.currency,
					merchantSecret,
				});
				return jsonResult({ mode: "checkout", hash });
			}

			// mode === "notify"
			if (
				args.payhereAmount === undefined ||
				args.payhereCurrency === undefined ||
				args.statusCode === undefined
			) {
				return errorResult(
					"mode='notify' requires `payhereAmount`, `payhereCurrency`, and `statusCode`.",
				);
			}

			const notifyInput = {
				merchantId,
				orderId: args.orderId,
				payhereAmount: args.payhereAmount,
				payhereCurrency: args.payhereCurrency,
				statusCode: args.statusCode,
				merchantSecret,
			};

			if (args.expectedMd5Sig !== undefined) {
				const valid = verifyNotifyHash(notifyInput, args.expectedMd5Sig);
				return jsonResult({
					mode: "notify",
					valid,
					expected: computeNotifyHash(notifyInput),
					provided: args.expectedMd5Sig.toUpperCase(),
				});
			}

			const hash = computeNotifyHash(notifyInput);
			return jsonResult({ mode: "notify", hash });
		},
	);
}

function jsonResult(data: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

function errorResult(message: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		isError: true,
	};
}
