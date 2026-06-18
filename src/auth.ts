/**
 * PayHere OAuth token management.
 *
 * PayHere issues short-lived access tokens (~599 seconds) via Basic auth on
 * /merchant/v1/oauth/token using the App ID + App Secret as a colon-joined,
 * base64-encoded Authorization code.
 *
 * Strategy:
 *  - Lazy fetch on first use.
 *  - In-memory cache with expiry tracking.
 *  - Refresh slightly before expiry (e.g. with 30s of headroom) to avoid
 *    races where the token expires between check and use.
 *  - Single in-flight refresh — concurrent callers wait on the same promise.
 *
 * TODO: implement in next pass. The exact response shape, error handling for
 * 401s, and retry strategy on transient network errors are worth a focused
 * design discussion before coding.
 */

import type { PayHereConfig } from "./config.js";

export interface AccessToken {
	value: string;
	/** Epoch ms when this token stops being usable. */
	expiresAt: number;
}

export interface AuthClient {
	getAccessToken(): Promise<string>;
}

export function createAuthClient(_config: PayHereConfig): AuthClient {
	return {
		async getAccessToken(): Promise<string> {
			throw new Error("auth.getAccessToken not implemented yet");
		},
	};
}
