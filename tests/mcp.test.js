import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function waitForHealth(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("MCP SSE server lists and executes skill tools", async () => {
  const port = 3132;
  const child = spawn("node", ["packages/mcp-server/src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SKILL_EVAL_MCP_PORT: String(port),
      SKILL_EVAL_ALLOWED_ROOTS: process.cwd(),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`);
    const client = new Client({ name: "skill-eval-test", version: "0.0.1" });
    const transport = new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`));
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "analyze_skill"));
    assert.ok(tools.tools.some((tool) => tool.name === "init_skill_benchmark"));
    const result = await client.callTool({
      name: "analyze_skill",
      arguments: {
        skillPath: `${process.cwd()}/examples/skills/sample-skill`,
      },
    });
    assert.equal(result.structuredContent.summary.overallScore, 100);
    await client.close();
  } finally {
    child.kill("SIGTERM");
  }
});
