/**
 * Tool: verify_credentials
 *
 * Health-check tool. Confirms env vars are wired up and that the configured
 * App credentials can successfully fetch an OAuth token. Returns mode and
 * merchant_id so devs can sanity-check they're pointing at the right account.
 *
 * This is a diagnostic: it never throws. A failed OAuth probe is reported as a
 * clean { tokenOk: false, tokenError } result rather than an exception.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthClient } from "../auth.js";
import type { PayHereConfig } from "../config.js";

/** Shape of an MCP tool result with text content and an optional error flag. */
type McpToolResult = {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
};

/**
 * Pure handler for verify_credentials — separated from registration for direct
 * unit-testing with a mocked AuthClient. Always resolves to a tool result; the
 * OAuth probe outcome is reported in the body, never via a thrown error.
 */
export async function handleVerifyCredentials(
	config: PayHereConfig,
	auth: AuthClient,
): Promise<McpToolResult> {
	const env = {
		mode: config.mode,
		merchantId: config.merchantId,
		baseUrl: config.baseUrl,
		checkoutUrl: config.checkoutUrl,
	};

	try {
		await auth.getAccessToken();
		const expiresAt = auth.getCachedTokenExpiry();
		const tokenExpiresInSeconds =
			expiresAt !== null ? Math.round((expiresAt - Date.now()) / 1000) : null;
		return jsonResult({ ...env, tokenOk: true, tokenExpiresInSeconds });
	} catch (err) {
		return jsonResult({
			...env,
			tokenOk: false,
			tokenError: err instanceof Error ? err.message : String(err),
		});
	}
}

export function registerVerifyCredentials(
	server: McpServer,
	config: PayHereConfig,
	auth: AuthClient,
): void {
	server.registerTool(
		"verify_credentials",
		{
			title: "Verify PayHere credentials",
			description:
				"Health check that confirms env vars are loaded and that the App " +
				"credentials can fetch an OAuth token. Useful first call when setting " +
				"up an integration.",
			inputSchema: {},
		},
		() => handleVerifyCredentials(config, auth),
	);
}

function jsonResult(data: unknown): McpToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
	};
}
