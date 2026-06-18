/**
 * Runtime configuration loaded from environment variables.
 *
 * Resolved once at server startup. Throws early with a clear message if
 * required values are missing — better than a cryptic auth failure later.
 */

export type PayHereMode = "sandbox" | "live";

export interface PayHereConfig {
	mode: PayHereMode;
	merchantId: string;
	merchantSecret: string;
	appId: string;
	appSecret: string;
	/** Base URL for the merchant API — depends on mode. */
	baseUrl: string;
	/** Base URL for the hosted checkout — depends on mode. */
	checkoutUrl: string;
}

const SANDBOX_BASE = "https://sandbox.payhere.lk";
const LIVE_BASE = "https://www.payhere.lk";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.trim() === "") {
		throw new Error(
			`Missing required environment variable: ${name}. ` +
				`Copy .env.example to .env and fill in your PayHere credentials.`,
		);
	}
	return value.trim();
}

function parseMode(raw: string | undefined): PayHereMode {
	const mode = (raw ?? "sandbox").toLowerCase();
	if (mode !== "sandbox" && mode !== "live") {
		throw new Error(`PAYHERE_MODE must be "sandbox" or "live", got: ${raw}`);
	}
	return mode;
}

export function loadConfig(): PayHereConfig {
	const mode = parseMode(process.env.PAYHERE_MODE);
	const base = mode === "live" ? LIVE_BASE : SANDBOX_BASE;

	return {
		mode,
		merchantId: requireEnv("PAYHERE_MERCHANT_ID"),
		merchantSecret: requireEnv("PAYHERE_MERCHANT_SECRET"),
		appId: requireEnv("PAYHERE_APP_ID"),
		appSecret: requireEnv("PAYHERE_APP_SECRET"),
		baseUrl: `${base}/merchant/v1`,
		checkoutUrl: `${base}/pay/checkout`,
	};
}
