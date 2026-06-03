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
    assert.match(result.content[0].text, /JSON_RESULT:/);
    const inlineResult = await client.callTool({
      name: "analyze_skill",
      arguments: {
        skillName: "inline-sample",
        skillMarkdown: `---
name: inline-sample
description: Use when testing inline Aily skill evaluation.
---

## Workflow
1. Check the request.
2. Execute the scoped task.

## Boundaries
Do not handle unrelated work.

## Verification
Verify the final output before responding.
`,
      },
    });
    assert.equal(inlineResult.structuredContent.target.name, "inline-sample");
    const benchmarkResult = await client.callTool({
      name: "init_skill_benchmark",
      arguments: {
        skillName: "inline-sample",
        skillMarkdown: `---
name: inline-sample
description: Use when testing inline benchmark creation.
---

## Workflow
Run a scoped task.

## Boundaries
Do not overreach.

## Verification
Check the result.
`,
        outputPath: "/home/gem/.aily/workdir/benchmark.json",
      },
    });
    assert.equal(benchmarkResult.structuredContent.scenarios.length, 3);
    assert.match(benchmarkResult.content[0].text, /OUTPUT_PATH_STATUS:/);
    assert.match(benchmarkResult.content[0].text, /"written": false/);
    assert.match(benchmarkResult.content[0].text, /JSON_RESULT:/);
    assert.match(benchmarkResult.content[0].text, /"kind": "skill-eval-benchmark"/);
    await client.close();
  } finally {
    child.kill("SIGTERM");
  }
});
