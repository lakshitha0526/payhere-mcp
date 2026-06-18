/**
 * Tool: create_checkout_payload
 *
 * Returns everything needed to submit a PayHere checkout form: the action URL,
 * the full set of form fields (including the computed hash), and an optional
 * pre-built HTML snippet for quick paste-and-test workflows.
 *
 * This is the most commonly-used tool — every PayHere integration starts here.
 *
 * The merchant secret is read from server config, never from tool arguments —
 * it is the credential that proves the request is genuinely from the merchant,
 * so it must never travel over the MCP wire as an input.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PayHereConfig } from "../config.js";
import { computeCheckoutHash, formatAmount } from "../signature.js";

/** Customer details that PayHere shows on the checkout page / uses for receipts. */
export interface CheckoutCustomer {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	address: string;
	city: string;
	country: string;
}

/** Caller-supplied inputs for a checkout payload (no secret — that comes from config). */
export interface CheckoutArgs {
	orderId: string;
	amount: number | string;
	currency: string;
	items: string;
	customer: CheckoutCustomer;
	returnUrl: string;
	cancelUrl: string;
	notifyUrl: string;
}

/**
 * The PayHere checkout form fields, in PayHere's own snake_case naming.
 * These map 1:1 to the `<input name="...">` fields PayHere's checkout expects.
 */
export interface CheckoutFields {
	merchant_id: string;
	return_url: string;
	cancel_url: string;
	notify_url: string;
	order_id: string;
	items: string;
	currency: string;
	amount: string;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	address: string;
	city: string;
	country: string;
	hash: string;
}

/** Everything a client needs to POST a checkout to PayHere. */
export interface CheckoutPayload {
	action_url: string;
	method: "POST";
	fields: CheckoutFields;
	html: string;
}

/**
 * Assemble a complete PayHere checkout payload from caller inputs + server config.
 *
 * Pulled out of the tool handler as a pure function so it can be unit-tested
 * directly against the locked PayHere hash vectors without standing up an MCP
 * server. The hash is computed with `computeCheckoutHash`, and the amount is
 * always run through `formatAmount` — PayHere rejects any other number format.
 */
export function buildCheckoutPayload(config: PayHereConfig, args: CheckoutArgs): CheckoutPayload {
	const amount = formatAmount(args.amount);
	const hash = computeCheckoutHash({
		merchantId: config.merchantId,
		orderId: args.orderId,
		amount,
		currency: args.currency,
		merchantSecret: config.merchantSecret,
	});

	const fields: CheckoutFields = {
		merchant_id: config.merchantId,
		return_url: args.returnUrl,
		cancel_url: args.cancelUrl,
		notify_url: args.notifyUrl,
		order_id: args.orderId,
		items: args.items,
		currency: args.currency,
		amount,
		first_name: args.customer.firstName,
		last_name: args.customer.lastName,
		email: args.customer.email,
		phone: args.customer.phone,
		address: args.customer.address,
		city: args.customer.city,
		country: args.customer.country,
		hash,
	};

	return {
		action_url: config.checkoutUrl,
		method: "POST",
		fields,
		html: renderHtmlForm(config.checkoutUrl, fields),
	};
}

/**
 * Render a self-submitting HTML form for the checkout fields.
 *
 * Convenience for developers: paste into a browser and it POSTs straight to
 * PayHere's sandbox/live checkout. Every value is HTML-attribute-escaped so a
 * stray quote in (say) the item description can't break out of the markup.
 */
function renderHtmlForm(actionUrl: string, fields: CheckoutFields): string {
	const inputs = (Object.entries(fields) as [string, string][])
		.map(([name, value]) => `\t<input type="hidden" name="${esc(name)}" value="${esc(value)}" />`)
		.join("\n");

	return [
		`<form id="payhere-checkout" method="post" action="${esc(actionUrl)}">`,
		inputs,
		'\t<noscript><button type="submit">Pay with PayHere</button></noscript>',
		"</form>",
		'<script>document.getElementById("payhere-checkout").submit();</script>',
	].join("\n");
}

/** Escape a string for safe interpolation into an HTML attribute value. */
function esc(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function registerCreateCheckoutPayload(server: McpServer, config: PayHereConfig): void {
	server.registerTool(
		"create_checkout_payload",
		{
			title: "Create PayHere checkout payload",
			description:
				"Generates the form data needed to POST a checkout request to PayHere, " +
				"including the MD5 hash. Returns action URL, form fields, and an HTML snippet. " +
				"Uses the merchant secret from the server's environment — never include the " +
				"secret in tool arguments.",
			inputSchema: {
				orderId: z.string().min(1).describe("Unique order identifier for this payment"),
				amount: z.number().positive().describe("Payment amount (will be formatted to 2dp)"),
				currency: z.string().length(3).describe("ISO 4217 currency code, e.g. LKR, USD"),
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
				notifyUrl: z.string().url().describe("Public URL PayHere will POST the payment result to"),
			},
		},
		async (args) => {
			const payload = buildCheckoutPayload(config, {
				orderId: args.orderId,
				amount: args.amount,
				currency: args.currency,
				items: args.items,
				customer: args.customer,
				returnUrl: args.returnUrl,
				cancelUrl: args.cancelUrl,
				notifyUrl: args.notifyUrl,
			});

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(payload, null, 2),
					},
				],
			};
		},
	);
}
