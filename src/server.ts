/**
 * MCP server assembly.
 *
 * Creates the McpServer instance, wires up the 5 v0.1 tools, and returns it
 * ready for connection to a transport (stdio, in our case).
 *
 * Keeping this as a factory (rather than top-level side effects) makes it
 * testable — a unit test can instantiate the server, list tools, and assert
 * the registry without ever touching stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPayHereApi } from "./api.js";
import { createAuthClient } from "./auth.js";
import type { PayHereConfig } from "./config.js";
import { registerCreateCheckoutPayload } from "./tools/create-checkout-payload.js";
import { registerGenerateSignature } from "./tools/generate-signature.js";
import { registerGetPayment } from "./tools/get-payment.js";
import { registerIssueRefund } from "./tools/issue-refund.js";
import { registerVerifyCredentials } from "./tools/verify-credentials.js";

const SERVER_NAME = "@lk-pay/payhere-mcp";
const SERVER_VERSION = "0.1.0";

export function createPayHereMcpServer(config: PayHereConfig): McpServer {
	const server = new McpServer({
		name: SERVER_NAME,
		version: SERVER_VERSION,
	});

	const auth = createAuthClient(config);
	const api = createPayHereApi(config, auth);

	registerCreateCheckoutPayload(server, config);
	registerGetPayment(server, api);
	registerIssueRefund(server, api);
	registerGenerateSignature(server, config);
	registerVerifyCredentials(server, config, auth);

	return server;
}
