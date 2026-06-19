# @lk-pay/payhere-mcp

[![npm](https://img.shields.io/npm/v/@lk-pay/payhere-mcp.svg)](https://www.npmjs.com/package/@lk-pay/payhere-mcp)
[![license](https://img.shields.io/npm/l/@lk-pay/payhere-mcp.svg)](./LICENSE)

A Model Context Protocol server for [PayHere](https://www.payhere.lk), Sri Lanka's payment gateway. It exposes PayHere's Merchant API and checkout flow as tools any MCP-aware client can call.

## Status

v0.1 — early preview. All five tools have been validated end-to-end against the PayHere sandbox. The transport is stdio only.

## What this is

This is an MCP server for developers integrating PayHere. It lets you retrieve payments, issue refunds, generate signed checkout payloads, and compute or verify PayHere hashes directly from Claude Code, Claude Desktop, or any other MCP client.

The audience is developers, not merchants. It helps you debug an integration, pull a payment record, issue a refund, and get a checkout signature right — it is not a dashboard replacement.

PayHere uses snake_case fields and MD5-based hashes throughout its API. The tools here mirror that surface exactly and handle the parts that are easy to get wrong, like amount formatting and signature computation.

## Quick start

Requires Node 18 or newer. If you already have a PayHere Business App and a whitelisted domain, run it directly:

```bash
npx @lk-pay/payhere-mcp
```

It reads configuration from the environment. The minimum is:

```bash
PAYHERE_MODE=sandbox
PAYHERE_MERCHANT_ID=your_merchant_id
PAYHERE_MERCHANT_SECRET=your_domain_bound_secret
PAYHERE_APP_ID=your_app_id
PAYHERE_APP_SECRET=your_app_secret
```

In Claude Code, add it to `~/.claude/mcp.json` (or a project-local `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "payhere": {
      "command": "npx",
      "args": ["-y", "@lk-pay/payhere-mcp"],
      "env": {
        "PAYHERE_MODE": "sandbox",
        "PAYHERE_MERCHANT_ID": "your_merchant_id",
        "PAYHERE_MERCHANT_SECRET": "your_domain_bound_secret",
        "PAYHERE_APP_ID": "your_app_id",
        "PAYHERE_APP_SECRET": "your_app_secret"
      }
    }
  }
}
```

## Setup

The Merchant API calls (`get_payment`, `issue_refund`, `verify_credentials`) need a Business App and a whitelisted domain. The checkout and signature tools work with just your merchant credentials.

### Step 1 — Create a PayHere Business App

Log in to [sandbox.payhere.lk](https://sandbox.payhere.lk) (or [www.payhere.lk](https://www.payhere.lk) for live). Go to **Settings → Business Apps → Create API Key**. Name the app, fill in the **Allowed Domains** field, and enable at least the **Payment Retrieval API** permission. Enable the **Refund API** permission too if you plan to issue refunds.

### Step 2 — How PayHere binds credentials to domains

This is the part that trips most people up, so it's worth stating plainly.

PayHere generates a separate `merchant_secret` for each domain you whitelist. A Merchant API call only succeeds when the `merchant_secret` you send is tied to a domain that PayHere can currently verify is reachable. If the domain can't be reached, the secret is rejected.

It is not a Referer check and not a source-IP check. It is a binding between the secret and a verifiable domain. So the secret in your environment and a live, reachable whitelisted domain have to line up at request time.

### Step 3 — Configure your domain

**Local development.** Use [ngrok](https://ngrok.com) or any similar publicly reachable tunnel. VS Code dev tunnels don't work here because their auth interstitial stops PayHere from verifying the domain. Run:

```bash
ngrok http <your-port>
```

Whitelist the ngrok URL in PayHere's Allowed Domains, then copy the `merchant_secret` PayHere generates for that domain into your `.env`. Keep the tunnel running the whole time you use the MCP server — if it stops, the domain stops being reachable and calls start failing.

**Production.** Deploy to a server with a stable domain or static IP. For sandbox, whitelist the domain through the dashboard. For live, PayHere whitelists by IP — email [support@payhere.lk](mailto:support@payhere.lk) with your production server IP and they'll add it.

### Step 4 — Note your credentials

From the dashboard, collect:

- **Merchant ID**
- **App ID** and **App Secret** (from the Business App you created)
- The **merchant_secret** tied to your whitelisted domain

### Step 5 — Install and configure

Install globally, or skip this and use `npx`:

```bash
npm install -g @lk-pay/payhere-mcp
```

Set these environment variables:

| Variable | Required | Description |
|---|---|---|
| `PAYHERE_MODE` | Yes | `sandbox` or `live`. Picks which PayHere environment the tools talk to. |
| `PAYHERE_MERCHANT_ID` | Yes | Your Merchant ID from the dashboard. |
| `PAYHERE_MERCHANT_SECRET` | Yes | The per-domain secret tied to your whitelisted domain. Used for checkout and notify hashes. |
| `PAYHERE_APP_ID` | Yes | Business App ID, used to fetch OAuth tokens for the Merchant API. |
| `PAYHERE_APP_SECRET` | Yes | Business App secret, paired with `PAYHERE_APP_ID`. |
| `PAYHERE_DOMAIN` | Optional | Bare domain (no scheme, no path), e.g. `your-tunnel.ngrok.app`. When set, requests include a `Referer: https://<domain>/` header matching your whitelisted domain. Leave it unset unless your setup needs it. |

### Step 6 — Wire into your MCP client

Add all the variables to your client config:

```json
{
  "mcpServers": {
    "payhere": {
      "command": "npx",
      "args": ["-y", "@lk-pay/payhere-mcp"],
      "env": {
        "PAYHERE_MODE": "sandbox",
        "PAYHERE_MERCHANT_ID": "your_merchant_id",
        "PAYHERE_MERCHANT_SECRET": "your_domain_bound_secret",
        "PAYHERE_APP_ID": "your_app_id",
        "PAYHERE_APP_SECRET": "your_app_secret",
        "PAYHERE_DOMAIN": "your-tunnel.ngrok.app"
      }
    }
  }
}
```

Once connected, run `verify_credentials` first to confirm your environment and OAuth token resolve correctly.

## Tools

| Tool | Purpose | When to reach for it |
|---|---|---|
| `create_checkout_payload` | Generate form fields + hash for a `/pay/checkout` submission | You're building a payment form and need a correctly signed payload. |
| `get_payment` | Retrieve all payment attempts for an `order_id` | You want to check an order's status or attempt history. |
| `issue_refund` | Refund a payment by `payment_id`, full or partial | A customer needs money back. |
| `generate_signature` | Compute or verify PayHere MD5 hashes (checkout + notify) | You're validating a notify callback or debugging a hash mismatch. |
| `verify_credentials` | Health-check env vars and fetch an OAuth token | You're setting up and want to confirm your config works. |

## Troubleshooting

The four errors you're most likely to see, and what they mean:

- **`{"status":-1,"msg":"Access denied for the domain"}`** — The `merchant_secret` is bound to a domain PayHere can't currently verify. Check that (a) your ngrok tunnel is up, (b) the `merchant_secret` in `.env` matches the whitelisted domain, and (c) you haven't mixed sandbox and live values.

- **`{"status":-2,"msg":"Authentication error"}`** — The App ID or App Secret is wrong, or the token belongs to a different Business App. Recheck `PAYHERE_APP_ID` and `PAYHERE_APP_SECRET`.

- **`{"error":"invalid_token"}`** — The access token is expired or malformed, which usually means the App credentials don't match what PayHere expects. Confirm the App ID and secret, then retry.

- **`{"status":-1,"msg":"No payments found"}`** — Not an error. The `order_id` has no payments yet. `get_payment` returns `attempts: []` with a `note` field explaining there's nothing on record.

## Design notes

- **No `list_payments`.** PayHere's Retrieval API only accepts an `order_id` — there is no date-range or status filter endpoint. `get_payment` returns the array of attempts for one order.
- **`generate_signature` is the differentiator.** Most PayHere integration bugs come from incorrect hash computation. This tool exposes the exact algorithm the gateway uses, with constant-time verification for notify URL validation.
- **stdio transport only in v0.1.** That's the supported transport for this release.

## Development

```bash
git clone https://github.com/lakshitha0526/payhere-mcp.git
cd payhere-mcp
npm install

npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # biome check
npm run build      # tsup
```

## License

MIT — see [LICENSE](./LICENSE).

Part of the [`lk-*`](https://www.npmjs.com/~lakshithasupun) family of Sri Lanka-focused developer tooling.
