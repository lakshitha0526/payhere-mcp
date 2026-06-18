/**
 * Thin PayHere REST client.
 *
 * Wraps the two real HTTP endpoints we hit in v0.1:
 *   - GET /payment/search?order_id=<id>   (Retrieval API)
 *   - POST /payment/refund                (Refund API)
 *
 * Both require a Bearer access token from auth.ts. This module deliberately
 * stays thin — request shaping, response parsing, and error normalisation only.
 * No retries, no caching. Higher-level tool handlers compose on top.
 *
 * TODO: implement in next pass. Response shapes need to be locked from real
 * sandbox responses, not docs — PayHere's docs are not always exhaustive about
 * optional fields and edge cases.
 */

import type { AuthClient } from "./auth.js";
import type { PayHereConfig } from "./config.js";

export interface PaymentRecord {
	payment_id: string;
	order_id: string;
	date: string;
	description?: string;
	status: string;
	// More fields once we lock the real response shape.
}

export interface RefundResult {
	status_code: number;
	msg: string;
	payment_id?: string;
}

export interface PayHereApi {
	getPaymentsByOrderId(orderId: string): Promise<PaymentRecord[]>;
	refundPayment(input: {
		paymentId: string;
		description: string;
		amount?: string;
	}): Promise<RefundResult>;
}

export function createPayHereApi(_config: PayHereConfig, _auth: AuthClient): PayHereApi {
	return {
		async getPaymentsByOrderId(_orderId): Promise<PaymentRecord[]> {
			throw new Error("api.getPaymentsByOrderId not implemented yet");
		},
		async refundPayment(_input): Promise<RefundResult> {
			throw new Error("api.refundPayment not implemented yet");
		},
	};
}
