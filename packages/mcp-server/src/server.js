#!/usr/bin/env node
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  analyzeSkill,
  buildImprovementBrief,
  compareEvaluations,
  createStarterBenchmark,
  readJson,
  renderReviewPacket,
  runBenchmark,
  writeJson,
} from "../../core/src/index.js";
import { ClaudeCodeRunner } from "../../runner-claude-code/src/index.js";
import { AilyRunner } from "../../runner-aily/src/index.js";

const PORT = Number(process.env.PORT || process.env.SKILL_EVAL_MCP_PORT || 3000);
const HOST = process.env.HOST || process.env.SKILL_EVAL_MCP_HOST || "0.0.0.0";
const ENABLE_RUNNER = process.env.SKILL_EVAL_MCP_ENABLE_RUNNER === "true";
const ALLOWED_ROOTS = (process.env.SKILL_EVAL_ALLOWED_ROOTS || process.cwd())
  .split(",")
  .map((root) => path.resolve(root.trim()))
  .filter(Boolean);

const transports = new Map();
const app = express();
app.use(express.json({ limit: "2mb" }));

function assertAllowedPath(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!ALLOWED_ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Path is outside allowed roots: ${resolved}`);
  }
  return resolved;
}

function resultPayload(value, summary = "ok") {
  const compact = compactValue(value);
  return {
    structuredContent: compact,
    content: [
      {
        type: "text",
        text: typeof summary === "string" ? summary : JSON.stringify(summary, null, 2),
      },
    ],
  };
}

function compactValue(value) {
  const json = JSON.stringify(value);
  if (json.length <= 60000) return value;
  return {
    truncated: true,
    message: "Result was truncated for Aily context safety. Read the output file for full details.",
    preview: JSON.parse(JSON.stringify(value, (_, nested) => {
      if (typeof nested === "string" && nested.length > 1000) return `${nested.slice(0, 1000)}...`;
      return nested;
    })),
  };
}

function userMeta(req) {
  return {
    ailyUser: req.headers["x-aily-user"] || null,
    ailyEmail: req.headers["x-aily-email"] || null,
    requestId: randomUUID(),
  };
}

function createMcpServer(meta = {}) {
  const server = new McpServer({
    name: "skill-eval-kilian",
    version: "0.1.0",
  });

  server.registerTool("analyze_skill", {
    title: "Analyze Skill",
    description: "Static skill-only evaluation. Does not evaluate plugins and does not score token budget.",
    inputSchema: {
      skillPath: z.string().describe("Path to a skill directory containing SKILL.md."),
      outputPath: z.string().optional().describe("Optional path to write full evaluation JSON."),
    },
  }, async ({ skillPath, outputPath }) => {
    const result = await analyzeSkill(assertAllowedPath(skillPath));
    if (outputPath) await writeJson(assertAllowedPath(outputPath), result);
    return resultPayload(result, `Analyzed skill ${result.target.name}. Score: ${result.summary.overallScore}. Risk: ${result.summary.riskLevel}.`);
  });

  server.registerTool("init_skill_benchmark", {
    title: "Initialize Skill Benchmark",
    description: "Create a starter benchmark with happy-path, follow-up, and boundary-case scenarios.",
    inputSchema: {
      skillPath: z.string(),
      runner: z.enum(["claude-code", "aily"]).default("aily"),
      workspacePath: z.string().optional(),
      command: z.string().optional(),
      outputPath: z.string().optional(),
    },
  }, async ({ skillPath, runner, workspacePath, command, outputPath }) => {
    const benchmark = createStarterBenchmark(assertAllowedPath(skillPath), {
      runner,
      workspace: workspacePath ? assertAllowedPath(workspacePath) : undefined,
      command,
    });
    if (outputPath) await writeJson(assertAllowedPath(outputPath), benchmark);
    return resultPayload(benchmark, `Created benchmark for ${benchmark.target.name} with ${benchmark.scenarios.length} starter scenarios.`);
  });

  server.registerTool("run_skill_benchmark", {
    title: "Run Skill Benchmark",
    description: "Run benchmark through a CLI-command runner. Disabled unless SKILL_EVAL_MCP_ENABLE_RUNNER=true.",
    inputSchema: {
      configPath: z.string(),
      runner: z.enum(["claude-code", "aily"]).default("aily"),
      outputPath: z.string().optional(),
    },
  }, async ({ configPath, runner, outputPath }) => {
    if (!ENABLE_RUNNER) {
      return resultPayload({
        blocked: true,
        reason: "Benchmark execution is disabled for MCP safety.",
        enable: "Set SKILL_EVAL_MCP_ENABLE_RUNNER=true on the server.",
      }, "Benchmark execution is disabled. Enable SKILL_EVAL_MCP_ENABLE_RUNNER=true to run agent commands.");
    }
    const adapter = runner === "aily" ? new AilyRunner() : new ClaudeCodeRunner();
    const result = await runBenchmark(assertAllowedPath(configPath), adapter);
    if (outputPath) await writeJson(assertAllowedPath(outputPath), result);
    return resultPayload(result, `Benchmark complete. Score: ${result.summary.benchmarkScore}. Completed: ${result.summary.completed}/${result.summary.scenarioCount}.`);
  });

  server.registerTool("score_benchmark_result", {
    title: "Score Benchmark Result",
    description: "Read a benchmark-run JSON and return its summary.",
    inputSchema: {
      benchmarkRunPath: z.string(),
    },
  }, async ({ benchmarkRunPath }) => {
    const run = await readJson(assertAllowedPath(benchmarkRunPath));
    return resultPayload(run.summary, `Benchmark score: ${run.summary?.benchmarkScore ?? "unknown"}.`);
  });

  server.registerTool("compare_skill_versions", {
    title: "Compare Skill Versions",
    description: "Compare two skill evaluation JSON files.",
    inputSchema: {
      beforePath: z.string(),
      afterPath: z.string(),
      outputPath: z.string().optional(),
    },
  }, async ({ beforePath, afterPath, outputPath }) => {
    const report = compareEvaluations(
      await readJson(assertAllowedPath(beforePath)),
      await readJson(assertAllowedPath(afterPath)),
    );
    if (outputPath) await writeJson(assertAllowedPath(outputPath), report);
    return resultPayload(report, `Compare complete. Delta: ${report.delta.overallScore}.`);
  });

  server.registerTool("suggest_skill_improvements", {
    title: "Suggest Skill Improvements",
    description: "Generate an improvement brief from an evaluation result.",
    inputSchema: {
      evaluationResultPath: z.string(),
      outputPath: z.string().optional(),
    },
  }, async ({ evaluationResultPath, outputPath }) => {
    const brief = buildImprovementBrief(await readJson(assertAllowedPath(evaluationResultPath)));
    if (outputPath) await writeJson(assertAllowedPath(outputPath), brief);
    return resultPayload(brief, `Improvement brief generated for ${brief.target.name}.`);
  });

  server.registerTool("generate_review_packet", {
    title: "Generate Review Packet",
    description: "Generate a PM-readable review packet from evaluation and optional benchmark evidence.",
    inputSchema: {
      evaluationResultPath: z.string(),
      benchmarkRunPath: z.string().optional(),
      outputPath: z.string().optional(),
    },
  }, async ({ evaluationResultPath, benchmarkRunPath, outputPath }) => {
    const evaluation = await readJson(assertAllowedPath(evaluationResultPath));
    const benchmark = benchmarkRunPath ? await readJson(assertAllowedPath(benchmarkRunPath)) : null;
    const packet = renderReviewPacket(evaluation, benchmark);
    if (outputPath) {
      const { writeText } = await import("../../core/src/index.js");
      await writeText(assertAllowedPath(outputPath), packet);
    }
    return resultPayload({ packet, user: meta }, "Review packet generated.");
  });

  return server;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "skill-eval-kilian",
    transport: "sse",
    runnerExecutionEnabled: ENABLE_RUNNER,
    allowedRoots: ALLOWED_ROOTS,
  });
});

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  transport.onclose = () => transports.delete(transport.sessionId);
  const server = createMcpServer(userMeta(req));
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Unknown or expired MCP session." });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  process.stdout.write(`Skill Eval MCP SSE server listening on http://${HOST}:${PORT}/sse\n`);
});
