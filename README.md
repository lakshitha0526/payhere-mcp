# @lk-pay/payhere-mcp

[![npm](https://img.shields.io/npm/v/@lk-pay/payhere-mcp.svg)](https://www.npmjs.com/package/@lk-pay/payhere-mcp)
[![license](https://img.shields.io/npm/l/@lk-pay/payhere-mcp.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server for [PayHere](https://www.payhere.lk) — Sri Lanka's payment gateway.

Lets developers retrieve payments, issue refunds, generate checkout payloads, and compute / verify PayHere signatures directly from Claude Code, Claude Desktop, or any other MCP-aware client.

## Status

v0.1 — early preview. Signature module is fully implemented and tested. API-backed tools (`get_payment`, `issue_refund`, `verify_credentials`) ship next.

## Install

```bash
# Use directly via npx (no install needed)
npx @lk-pay/payhere-mcp

# Or install globally
npm install -g @lk-pay/payhere-mcp
```

## Configure

Set the following environment variables. Copy `.env.example` to `.env` for local use, or pass them via your MCP client's config block.

| Variable | Required | Description |
|---|---|---|
| `PAYHERE_MODE` | yes | `sandbox` or `live` |
| `PAYHERE_MERCHANT_ID` | yes | From PayHere dashboard → Settings → Integrations |
| `PAYHERE_MERCHANT_SECRET` | yes | Domain-specific secret |
| `PAYHERE_APP_ID` | yes | From Settings → Business Apps |
| `PAYHERE_APP_SECRET` | yes | App secret paired with `PAYHERE_APP_ID` |
| `PAYHERE_DOMAIN` | optional | Whitelisted domain from your PayHere Business App's "Allowed Domains" field (no scheme). Sent as a Referer header. Required if your PayHere account enforces domain-based access. |

### Claude Code setup

Add to your `~/.claude/mcp.json` (or project-local `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "payhere": {
      "command": "npx",
      "args": ["-y", "@lk-pay/payhere-mcp"],
      "env": {
        "PAYHERE_MODE": "sandbox",
        "PAYHERE_MERCHANT_ID": "YOUR_MERCHANT_ID",
        "PAYHERE_MERCHANT_SECRET": "YOUR_MERCHANT_SECRET",
        "PAYHERE_APP_ID": "YOUR_APP_ID",
        "PAYHERE_APP_SECRET": "YOUR_APP_SECRET"
      }
    }
  }
}
```

## Tools

| Tool | Purpose |
|---|---|
| `create_checkout_payload` | Generate form fields + hash for `/pay/checkout` submission |
| `get_payment` | Retrieve all payment attempts for an `order_id` |
| `issue_refund` | Refund a payment by `payment_id` (full or partial) |
| `generate_signature` | Compute or verify PayHere MD5 hashes (checkout + notify) |
| `verify_credentials` | Health-check env vars + OAuth token fetch |

### Design notes

- **No `list_payments`.** PayHere's Retrieval API only accepts `order_id` — there is no date-range / status filter endpoint. `get_payment` returns the array of attempts for an order.
- **`generate_signature` is the differentiator.** Most PayHere integration bugs come from incorrect hash computation. This tool exposes the exact algorithm used by the gateway, with constant-time verification for notify URL validation.
- **stdio transport only in v0.1.** Remote / HTTP transport is on the roadmap.

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
