/**
 * Tests for the verify_credentials tool handler.
 *
 * Drives the pure handleVerifyCredentials function with a mocked AuthClient.
 * Confirms the success/failure shapes, that env fields appear in both, and
 * that the handler never throws (it's a diagnostic).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "../../src/auth.js";
import type { PayHereConfig } from "../../src/config.js";
import { handleVerifyCredentials } from "../../src/tools/verify-credentials.js";

const config: PayHereConfig = {
	mode: "sandbox",
	merchantId: "merchant-id",
	merchantSecret: "merchant-secret",
	appId: "app-id",
	appSecret: "app-secret",
	baseUrl: "https://sandbox.payhere.lk/merchant/v1",
	checkoutUrl: "https://sandbox.payhere.lk/pay/checkout",
};

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function parseText(result: ToolResult): Record<string, unknown> {
	const first = result.content[0];
	if (!first) throw new Error("expected tool result content");
	return JSON.parse(first.text);
}

let getAccessToken: ReturnType<typeof vi.fn>;
let getCachedTokenExpiry: ReturnType<typeof vi.fn>;
let auth: AuthClient;

beforeEach(() => {
	getAccessToken = vi.fn();
	getCachedTokenExpiry = vi.fn();
	auth = { getAccessToken, getCachedTokenExpiry };
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("handleVerifyCredentials", () => {
	it("reports tokenOk: true and remaining lifetime on a successful probe", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		getAccessToken.mockResolvedValue("a-token");
		getCachedTokenExpiry.mockReturnValue(569_000); // 569s out from t=0

		const result = await handleVerifyCredentials(config, auth);

		expect(result.isError).toBeUndefined();
		const payload = parseText(result);
		expect(payload).toMatchObject({
			mode: "sandbox",
			merchantId: "merchant-id",
			baseUrl: config.baseUrl,
			checkoutUrl: config.checkoutUrl,
			tokenOk: true,
			tokenExpiresInSeconds: 569,
		});
	});

	it("reports tokenOk: false with the error text but keeps the env fields", async () => {
		getAccessToken.mockRejectedValue(new Error("PayHere auth failed (401): bad creds"));

		const result = await handleVerifyCredentials(config, auth);

		const payload = parseText(result);
		expect(payload).toMatchObject({
			mode: "sandbox",
			merchantId: "merchant-id",
			baseUrl: config.baseUrl,
			checkoutUrl: config.checkoutUrl,
			tokenOk: false,
			tokenError: "PayHere auth failed (401): bad creds",
		});
		expect(payload.tokenExpiresInSeconds).toBeUndefined();
	});

	it("never throws, even when the auth probe rejects", async () => {
		getAccessToken.mockRejectedValue(new Error("boom"));

		await expect(handleVerifyCredentials(config, auth)).resolves.toBeDefined();
	});
});
