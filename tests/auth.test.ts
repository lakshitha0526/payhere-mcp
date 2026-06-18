/**
 * Auth client tests.
 *
 * These drive the OAuth lifecycle against a mocked global `fetch`: first-fetch
 * shaping, caching, expiry-triggered refresh, single in-flight de-duplication,
 * and the error/secret-safety contract. No real network is ever touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../src/auth.js";
import type { PayHereConfig } from "../src/config.js";

// A distinctive secret value we can grep error messages for — it must never
// leak out of the auth client in any thrown message.
const SECRET_CANARY = "SECRET_LEAK_CANARY";

const config: PayHereConfig = {
	mode: "sandbox",
	merchantId: "merchant-id",
	merchantSecret: "merchant-secret",
	appId: "PAYHERE_APP_ID_VALUE",
	appSecret: SECRET_CANARY,
	baseUrl: "https://sandbox.payhere.lk/merchant/v1",
	checkoutUrl: "https://sandbox.payhere.lk/pay/checkout",
};

const TOKEN_URL = "https://sandbox.payhere.lk/merchant/v1/oauth/token";
const EXPECTED_CREDENTIAL = Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64");

// PayHere's documented success payload shape.
const TOKEN_BODY = {
	access_token: "TOKEN_ABC",
	token_type: "Bearer",
	expires_in: 599,
	scope: "SANDBOX",
} as const;

/** Build a minimal fetch Response stand-in for the mock. */
function makeResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("createAuthClient.getAccessToken", () => {
	it("fetches a token from the OAuth endpoint on first call", async () => {
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		const token = await client.getAccessToken();

		expect(token).toBe("TOKEN_ABC");
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(TOKEN_URL);
		expect(init?.method).toBe("POST");
		expect(init?.headers.Authorization).toBe(`Basic ${EXPECTED_CREDENTIAL}`);
		expect(init?.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
		expect(init?.body).toBe("grant_type=client_credentials");
	});

	it("returns the cached token on a second call within expiry (one fetch total)", async () => {
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		const first = await client.getAccessToken();
		const second = await client.getAccessToken();

		expect(first).toBe("TOKEN_ABC");
		expect(second).toBe("TOKEN_ABC");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("refreshes once the cached token has expired (two fetches)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		await client.getAccessToken();
		// Token: expiresAt = 0 + (599 - 30) * 1000 = 569_000 ms. Jump just past it.
		vi.setSystemTime(569_001);
		await client.getAccessToken();

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("de-duplicates concurrent calls into a single in-flight fetch", async () => {
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		const results = await Promise.all([
			client.getAccessToken(),
			client.getAccessToken(),
			client.getAccessToken(),
			client.getAccessToken(),
			client.getAccessToken(),
		]);

		expect(results).toEqual(["TOKEN_ABC", "TOKEN_ABC", "TOKEN_ABC", "TOKEN_ABC", "TOKEN_ABC"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("starts a fresh fetch after an in-flight refresh fails", async () => {
		// First attempt rejects, second succeeds — proves inflightRequest is cleared.
		fetchMock
			.mockRejectedValueOnce(new Error("ECONNREFUSED"))
			.mockResolvedValueOnce(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		await expect(client.getAccessToken()).rejects.toThrow(/network error/);
		const token = await client.getAccessToken();

		expect(token).toBe("TOKEN_ABC");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("createAuthClient error handling", () => {
	it("throws with status code and response body on a non-2xx response", async () => {
		fetchMock.mockResolvedValue(makeResponse("Invalid credentials", 401));
		const client = createAuthClient(config);

		await expect(client.getAccessToken()).rejects.toThrow(
			"PayHere auth failed (401): Invalid credentials",
		);
	});

	it("rethrows network failures with a network error prefix", async () => {
		fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
		const client = createAuthClient(config);

		await expect(client.getAccessToken()).rejects.toThrow(
			"PayHere auth network error: ECONNREFUSED",
		);
	});

	it("throws a clear error when access_token is missing from the response", async () => {
		fetchMock.mockResolvedValue(makeResponse({ scope: "SANDBOX" }));
		const client = createAuthClient(config);

		await expect(client.getAccessToken()).rejects.toThrow(
			"PayHere auth returned unexpected response shape",
		);
	});

	it("never leaks the app secret into any thrown error message", async () => {
		// appSecret is set to SECRET_CANARY in `config`. Exercise every error
		// path and assert the credential never surfaces in what we throw — the
		// only place it lives is the base64 Basic header, which we never echo.
		const scenarios: Array<() => void> = [
			() => fetchMock.mockResolvedValue(makeResponse("Invalid credentials", 401)),
			() => fetchMock.mockRejectedValue(new Error("ECONNREFUSED")),
			() => fetchMock.mockResolvedValue(makeResponse({ scope: "SANDBOX" })),
		];

		const messages: string[] = [];
		for (const setup of scenarios) {
			fetchMock.mockReset();
			setup();
			const client = createAuthClient(config);
			try {
				await client.getAccessToken();
				throw new Error("expected getAccessToken to reject");
			} catch (err) {
				messages.push(err instanceof Error ? err.message : String(err));
			}
		}

		for (const message of messages) {
			expect(message).not.toContain(SECRET_CANARY);
		}
	});
});

describe("createAuthClient.getCachedTokenExpiry", () => {
	it("is null before any fetch, the expiry after success, and null after a failed fetch", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config);

		// Nothing cached yet.
		expect(client.getCachedTokenExpiry()).toBeNull();

		// After a successful fetch: expiresAt = 0 + (599 - 30) * 1000 = 569_000.
		await client.getAccessToken();
		expect(client.getCachedTokenExpiry()).toBe(569_000);

		// A fresh client whose fetch fails caches nothing.
		fetchMock.mockReset();
		fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
		const failing = createAuthClient(config);
		await expect(failing.getAccessToken()).rejects.toThrow(/network error/);
		expect(failing.getCachedTokenExpiry()).toBeNull();
	});
});

describe("createAuthClient Referer header", () => {
	it("sends Referer: https://<domain>/ when a domain is configured", async () => {
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient({ ...config, domain: "mysite.com" });

		await client.getAccessToken();

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(init?.headers.Referer).toBe("https://mysite.com/");
	});

	it("omits the Referer header entirely when no domain is configured", async () => {
		fetchMock.mockResolvedValue(makeResponse(TOKEN_BODY));
		const client = createAuthClient(config); // config has no domain

		await client.getAccessToken();

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(init?.headers).not.toHaveProperty("Referer");
	});
});
