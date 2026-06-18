/**
 * PayHere OAuth token management.
 *
 * PayHere issues short-lived access tokens (~599 seconds) via Basic auth on
 * /merchant/v1/oauth/token using the App ID + App Secret as a colon-joined,
 * base64-encoded Authorization code.
 *
 * Strategy:
 *  - Lazy fetch on first use — no network call until getAccessToken() runs.
 *  - In-memory cache with expiry tracking (epoch ms).
 *  - Refresh with 30s of headroom so a token never expires between the validity
 *    check and the request that uses it (PayHere's clock and ours can drift).
 *  - Single in-flight refresh — concurrent callers all await the same promise
 *    rather than each firing their own token request.
 *
 * Security: the App Secret, merchant secret, and the token value itself are
 * never placed in error messages or logs. Credentials are referenced only by
 * their env var names (PAYHERE_APP_ID, PAYHERE_APP_SECRET) when context helps.
 */

import { z } from "zod";
import type { PayHereConfig } from "./config.js";

export interface AccessToken {
	value: string;
	/** Epoch ms when this token stops being usable. */
	expiresAt: number;
}

export interface AuthClient {
	getAccessToken(): Promise<string>;
}

/** Seconds of headroom subtracted from `expires_in` to avoid expiry races. */
const EXPIRY_HEADROOM_SECONDS = 30;

/** Max characters of an error response body we surface — keeps errors bounded. */
const MAX_ERROR_BODY_CHARS = 500;

/**
 * PayHere's OAuth success payload. We only require the two fields we actually
 * use; extra fields (token_type, scope) are ignored. Parsing rather than
 * casting means a missing/!string access_token is caught here, not later.
 */
const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number(),
});

/**
 * Create a lazy, self-refreshing PayHere OAuth client.
 *
 * Exists so every caller that needs a Bearer token (api.ts, verify_credentials)
 * shares one cache and one in-flight refresh, instead of each re-implementing
 * token lifecycle and hammering the OAuth endpoint.
 */
export function createAuthClient(config: PayHereConfig): AuthClient {
	const tokenUrl = `${config.baseUrl}/oauth/token`;
	// base64(appId:appSecret) — the Basic credential. Computed once; never logged.
	const basicCredential = Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64");

	let cached: AccessToken | null = null;
	let inflightRequest: Promise<AccessToken> | null = null;

	/** Perform the actual token request + parse. No caching concerns live here. */
	async function fetchToken(): Promise<AccessToken> {
		let response: Response;
		try {
			response = await fetch(tokenUrl, {
				method: "POST",
				headers: {
					Authorization: `Basic ${basicCredential}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "grant_type=client_credentials",
			});
		} catch (err) {
			// fetch only rejects on network-level failure (DNS, refused, reset).
			const detail = err instanceof Error ? err.message : String(err);
			throw new Error(`PayHere auth network error: ${detail}`);
		}

		if (!response.ok) {
			const body = (await safeReadBody(response)).slice(0, MAX_ERROR_BODY_CHARS);
			throw new Error(`PayHere auth failed (${response.status}): ${body}`);
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error("PayHere auth returned unexpected response shape");
		}

		const parsed = tokenResponseSchema.safeParse(payload);
		if (!parsed.success) {
			// Don't echo the body — it may, in principle, contain token material.
			throw new Error("PayHere auth returned unexpected response shape");
		}

		return {
			value: parsed.data.access_token,
			expiresAt: Date.now() + (parsed.data.expires_in - EXPIRY_HEADROOM_SECONDS) * 1000,
		};
	}

	return {
		async getAccessToken(): Promise<string> {
			// (a) A still-valid cached token wins — no network, no waiting.
			if (cached && cached.expiresAt > Date.now()) {
				return cached.value;
			}

			// (b) A refresh is already running — join it instead of starting another.
			if (inflightRequest) {
				return (await inflightRequest).value;
			}

			// (c) Nothing valid and nothing in flight — start the single refresh.
			inflightRequest = fetchToken();
			try {
				const token = await inflightRequest;
				cached = token;
				return token.value;
			} finally {
				// Always clear, success or failure, so the next call can retry.
				inflightRequest = null;
			}
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
