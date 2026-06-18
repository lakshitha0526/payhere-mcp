/**
 * @lk-pay/payhere-mcp — MCP server entry point.
 *
 * Reads PayHere credentials from environment variables, builds the MCP server,
 * and connects it to stdio. This is the binary an MCP client (Claude Code,
 * Claude Desktop, etc) launches as a subprocess.
 *
 * Anything written to stdout MUST be JSON-RPC — diagnostic output goes to
 * stderr, otherwise we corrupt the protocol stream.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createPayHereMcpServer } from "./server.js";

async function main(): Promise<void> {
	const config = loadConfig();
	const server = createPayHereMcpServer(config);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Use stderr for any diagnostic output — stdout is reserved for JSON-RPC.
	console.error(
		`[payhere-mcp] ready in ${config.mode} mode for merchant ${config.merchantId}`,
	);
}

main().catch((err) => {
	console.error("[payhere-mcp] fatal:", err instanceof Error ? err.message : err);
	process.exit(1);
});
