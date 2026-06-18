/**
 * Tool: verify_credentials
 *
 * Health-check tool. Confirms env vars are wired up and that the configured
 * App credentials can successfully fetch an OAuth token. Returns mode and
 * merchant_id so devs can sanity-check they're pointing at the right account.
 *
 * Note: only the OAuth probe requires auth.ts to be implemented. Until then,
 * we return a partial response showing what env vars resolved.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthClient } from "../auth.js";
import type { PayHereConfig } from "../config.js";

export function registerVerifyCredentials(
	server: McpServer,
	config: PayHereConfig,
	_auth: AuthClient,
): void {
	server.registerTool(
		"verify_credentials",
		{
			title: "Verify PayHere credentials",
			description:
				"Health check that confirms env vars are loaded and (once implemented) " +
				"that the App credentials can fetch an OAuth token. Useful first call " +
				"when setting up an integration.",
			inputSchema: {},
		},
		async () => {
			// TODO: when auth.ts is implemented, also call auth.getAccessToken() and
			// include `tokenOk: true/false`.
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								mode: config.mode,
								merchantId: config.merchantId,
								baseUrl: config.baseUrl,
								checkoutUrl: config.checkoutUrl,
								tokenOk: null,
								note: "OAuth probe not yet implemented — credentials are loaded but unverified.",
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}
