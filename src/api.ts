/**
 * Thin PayHere REST client.
 *
 * Wraps the two real HTTP endpoints we hit in v0.1:
 *   - GET /payment/search?order_id=<id>   (Retrieval API)
 *   - POST /payment/refund                (Refund API)
 *
 * Both require a Bearer access token from auth.ts and both wrap their result in
 * PayHere's `{ status, msg, data }` envelope (status === 1 means success). This
 * module stays thin — request shaping, envelope unwrapping, response parsing,
 * and error normalisation only. No retries, no caching. Tool handlers compose
 * on top.
 *
 * Security: the Bearer token, app secret, and merchant secret are never placed
 * in error messages or logs. Only PayHere's own status/msg/body is surfaced.
 */

import { z } from "zod";
import type { AuthClient } from "./auth.js";
import type { PayHereConfig } from "./config.js";
import { formatAmount } from "./signature.js";

export interface PaymentRecord {
	/** Normalised to string — PayHere's retrieval API returns this as a number. */
	payment_id: string;
	order_id: string;
	date: string;
	description?: string;
	status: string;
	currency: string;
	amount: number;
	// PayHere returns many more fields (card, customer, amount_detail, …). We
	// model only what we rely on and let the rest passthrough untouched.
	[key: string]: unknown;
}

export interface RefundResult {
	/** Envelope status — 1 on success. */
	status: number;
	/** Envelope message, e.g. "Successfully processed the refund". */
	msg: string;
	/** PayHere's refund transaction id (the envelope's `data` field), as a string. */
	data: string;
}

export interface PayHereApi {
	getPaymentsByOrderId(orderId: string): Promise<PaymentRecord[]>;
	refundPayment(input: {
		paymentId: string;
		description: string;
		amount?: number;
	}): Promise<RefundResult>;
}

/** Max characters of an error response body we surface — keeps errors bounded. */
const MAX_ERROR_BODY_CHARS = 500;

/**
 * PayHere's response envelope. `data` is left as unknown here and validated
 * against an endpoint-specific schema once we know which call produced it —
 * a missing/!shape `data` is therefore caught at the endpoint layer.
 */
const envelopeSchema = z
	.object({
		status: z.number(),
		msg: z.string(),
		data: z.unknown(),
	})
	.passthrough();

/**
 * A single payment attempt. `.passthrough()` keeps PayHere's unenumerated
 * fields rather than failing the parse when they add new ones.
 */
const paymentRecordSchema = z
	.object({
		// PayHere's retrieval API returns payment_id as a JSON number (e.g.
		// 320032619523). Coerce to string so it matches PaymentRecord and feeds
		// straight into issue_refund, which expects a string payment_id.
		payment_id: z.coerce.string(),
		order_id: z.string(),
		date: z.string(),
		description: z.string().optional(),
		status: z.string(),
		currency: z.string(),
		amount: z.number(),
	})
	.passthrough();

const paymentArraySchema = z.array(paymentRecordSchema);

/**
 * PayHere's refund response carries the refund transaction id in the envelope's
 * `data` field as a number (e.g. 560034237057) — NOT a nested object. Accept
 * number or string and normalise to string: consistent with payment_id and
 * precision-safe for large ids.
 */
const refundIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value));

/** The parsed PayHere response envelope. The `data` shape varies per endpoint. */
type PayHereEnvelope = { status: number; msg: string; data: unknown };

/**
 * Create the PayHere REST client.
 *
 * Takes the shared AuthClient rather than minting tokens itself, so the whole
 * process reuses one cached token and one in-flight refresh (see auth.ts).
 */
export function createPayHereApi(config: PayHereConfig, auth: AuthClient): PayHereApi {
	/**
	 * Send an authenticated request and return the unwrapped `data`.
	 *
	 * Auth errors are intentionally NOT caught here — getAccessToken() already
	 * throws well-formatted messages, so wrapping them would only obscure them.
	 */
	async function sendRequest(
		method: "GET" | "POST",
		url: string,
		body?: string,
	): Promise<PayHereEnvelope> {
		const token = await auth.getAccessToken();

		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
		};
		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}
		// PayHere accounts with domain enforcement match this against Allowed Domains.
		if (config.domain) {
			headers.Referer = `https://${config.domain}/`;
		}

		let response: Response;
		try {
			response = await fetch(url, { method, headers, body });
		} catch (err) {
			// fetch only rejects on network-level failure (DNS, refused, reset).
			const detail = err instanceof Error ? err.message : String(err);
			throw new Error(`PayHere API network error: ${detail}`);
		}

		if (!response.ok) {
			const errorBody = (await safeReadBody(response)).slice(0, MAX_ERROR_BODY_CHARS);
			throw new Error(`PayHere API failed (${response.status}): ${errorBody}`);
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error("PayHere API returned unexpected response shape");
		}

		const envelope = envelopeSchema.safeParse(payload);
		if (!envelope.success) {
			throw new Error("PayHere API returned unexpected response shape");
		}

		if (envelope.data.status !== 1) {
			throw new Error(`PayHere API error (status=${envelope.data.status}): ${envelope.data.msg}`);
		}

		return { status: envelope.data.status, msg: envelope.data.msg, data: envelope.data.data };
	}

	return {
		async getPaymentsByOrderId(orderId): Promise<PaymentRecord[]> {
			const url = `${config.baseUrl}/payment/search?order_id=${encodeURIComponent(orderId)}`;
			const { data } = await sendRequest("GET", url);

			const parsed = paymentArraySchema.safeParse(data);
			if (!parsed.success) {
				throw new Error("PayHere API returned unexpected response shape");
			}
			return parsed.data;
		},

		async refundPayment(input): Promise<RefundResult> {
			const body: { payment_id: string; description: string; amount?: string } = {
				payment_id: input.paymentId,
				description: input.description,
			};
			// Only send amount for partial refunds; omitting it means full refund.
			if (input.amount !== undefined) {
				body.amount = formatAmount(input.amount);
			}

			const envelope = await sendRequest(
				"POST",
				`${config.baseUrl}/payment/refund`,
				JSON.stringify(body),
			);

			const refundId = refundIdSchema.safeParse(envelope.data);
			if (!refundId.success) {
				throw new Error("PayHere API returned unexpected response shape");
			}
			return { status: envelope.status, msg: envelope.msg, data: refundId.data };
		},
	};
}

/** Read a response body as text, degrading to a placeholder if the read fails. */
async function safeReadBody(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "<unreadable response body>";
	}
}
