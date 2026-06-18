# CLAUDE.md — @lk-pay/payhere-mcp

Context for Claude Code working in this repo. Read this before any change.

## What this is

v0.1 of a Model Context Protocol server for **PayHere** — Sri Lanka's payment gateway. Wraps PayHere's Merchant API and checkout flow as MCP tools, callable from Claude Code, Claude Desktop, or any MCP-aware client.

Audience: **developers integrating PayHere**, not merchants. The product helps devs debug, retrieve, refund, and sign — it is not a dashboard substitute.

## Scope and locked decisions

- **stdio transport only** in v0.1. Remote / HTTP transport is v0.2 work — do not add it.
- **5 tools** in v0.1: `create_checkout_payload`, `get_payment`, `issue_refund`, `generate_signature`, `verify_credentials`. No more, no less.
- **No `list_payments`** — PayHere's Retrieval API only takes `order_id`. There is no date-range / status filter endpoint. Do not try to invent one.
- **No subscription tools in v0.1.** Subscription endpoints exist (cancel, retry, list-payments-of-subscription) but they're v0.2.
- **No HTTP library** — use native `fetch` from Node 18+. Do not add axios / node-fetch / undici.
- **No new npm dependencies** without discussion. Current deps are minimal on purpose (`@modelcontextprotocol/sdk`, `zod`, dev tooling only).
- **ESM, Node 18+, TypeScript strict** (`noUncheckedIndexedAccess` is on — index access can return `undefined`, handle it).
- **MIT licensed**, part of the `@lk-pay` and `lk-*` namespaces.

## Status

### Implemented and tested

- All scaffolding: `package.json`, `tsconfig.json`, `tsup.config.ts`, `biome.json`, `.env.example`, `LICENSE`
- `src/config.ts` — env parsing, sandbox/live URL resolution
- `src/signature.ts` — checkout hash, notify hash, constant-time verification, amount formatting (21 tests passing)
- `src/tools/generate-signature.ts` — fully implemented and tested end-to-end via MCP Inspector
- `src/server.ts` + `src/index.ts` — server bootstrap, all 5 tools registered

### Stubbed (return "not implemented yet" via clean MCP error)

- `src/auth.ts` — OAuth token fetch + cache
- `src/api.ts` — Retrieval + Refund HTTP calls
- `src/tools/create-checkout-payload.ts`
- `src/tools/get-payment.ts`
- `src/tools/issue-refund.ts`
- `src/tools/verify-credentials.ts` — partial; returns env state but `tokenOk: null`

## Implementation order

1. **`create_checkout_payload`** — pure logic, depends only on `signature.ts` + `config.ts`. No auth, no HTTP. Quickest next win.
2. **`auth.ts`** — OAuth token cache against `/merchant/v1/oauth/token`. Lazy fetch, expiry tracking, single in-flight refresh.
3. **`api.ts`** — Retrieval (`GET /payment/search?order_id=X`) and Refund (`POST /payment/refund`). Uses `auth.ts` for Bearer token.
4. **`get_payment` + `issue_refund`** tools — thin wrappers over `api.ts`.
5. **`verify_credentials`** wire-up — call `auth.getAccessToken()` to populate `tokenOk`.

Each step ships with tests. No "implement everything then test."

## PayHere API gotchas (hard-earned)

- **Hash format is unforgiving.** Amount MUST be the output of `formatAmount()` — `"1000.00"`, not `"1,000.00"`, not `"1000"`. Thousands separators are the #1 cause of "hash mismatch" rejections.
- **Merchant secret is per-domain.** Sandbox and live have different secrets, and within each, every whitelisted domain has its own. The `PAYHERE_MERCHANT_SECRET` env var must match the domain in the `Referer` header at request time.
- **Retrieval API returns an array.** One `order_id` can have multiple payment attempts (failed, retried, refunded, chargedback). Always expect `PaymentRecord[]`, never a single record.
- **OAuth tokens last ~599 seconds.** Refresh with at least 30s headroom — fetching at T-0 races with the API's clock.
- **PayHere uses snake_case** everywhere in API payloads (`order_id`, `payment_id`, `status_code`, `md5sig`). Preserve snake_case in TypeScript types that mirror API responses — do not silently camel-case incoming fields.
- **Notify URL POST is form-encoded**, not JSON. PayHere's notify webhook sends `application/x-www-form-urlencoded`.
- **Status codes are strings, not numbers.** `"2"` = success, `"0"` = pending, `"-1"` = canceled, `"-2"` = failed, `"-3"` = chargedback. Compare as strings.

## Coding conventions

- Match the style of `src/signature.ts` and `src/config.ts`. Look at them before writing new code.
- Tabs for indent (biome enforces it).
- Double quotes, semicolons, trailing commas (biome enforces).
- No `any`. Use `unknown` + Zod `.parse()` for API responses.
- No `as` type assertions on API responses — parse, don't cast.
- Every exported function gets a JSDoc explaining *why* it exists, not just *what* it does.
- Errors include actionable context (e.g. "Hash mismatch — check PAYHERE_MERCHANT_SECRET matches your whitelisted domain"), not just "Invalid hash."
- Tests live in `tests/` mirroring `src/` structure (`src/api.ts` → `tests/api.test.ts`).
- Use the test vector pattern from `tests/signature.test.ts` — concrete inputs, precomputed expected outputs, dedicated fixture constants at the top.

## Architectural patterns

- **Factory functions, not classes** for stateful things (`createAuthClient`, `createPayHereApi`). Easier to mock in tests.
- **Tools register themselves** via `registerX(server, deps)` exported from `src/tools/*.ts`. Server assembly in `src/server.ts` only calls these.
- **Config is loaded once** at startup in `src/index.ts` and passed down explicitly. No singleton, no `process.env` reads outside `config.ts`.
- **stdout is sacred** — only JSON-RPC goes there. All logging / diagnostics use `console.error`.

## Never do

- Don't write to stdout for diagnostics — corrupts the MCP transport.
- Don't log credentials, secrets, hashes-with-secret-inputs, or full env contents at any log level.
- Don't change the algorithm in `signature.ts`. The test vectors come from PayHere's documented values; if you "fix" something there, you break the gateway contract.
- Don't add remote transport, subscription tools, or `list_payments`. If a feature isn't in the v0.1 list above, it's not v0.1 work.
- Don't introduce new npm dependencies. If you think you need one, surface it in a comment and ask.
- Don't camel-case API response fields silently. PayHere uses snake_case — mirror it in types.
- Don't catch errors and swallow them. Either let them propagate or wrap with added context.

## Local commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (21 tests passing baseline)
npm run lint        # biome check
npm run lint:fix    # biome check --write
npm run build       # tsup → dist/

# Interactive testing
set -a; source .env; set +a
npx @modelcontextprotocol/inspector node dist/index.js
```

## Test vectors locked

The `tests/signature.test.ts` vectors come from PayHere's documented placeholder values (`merchant_id="2xxxxx"`, `merchant_secret="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`):

- `secretHash` = `DC8FE1D6497EBD23F5975D8D2A1C5E81`
- `checkoutHash` (order=12345, amount=1000.00, currency=LKR) = `D76F7AB16EDBE176244577AE8A46F460`
- `notifyHash` (same + status_code=2) = `ABA32E234F1A1E99ECC80F02BFF94AB4`

These are the gateway contract. Do not change them.
