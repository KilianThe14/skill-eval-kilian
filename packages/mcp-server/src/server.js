#!/usr/bin/env node
import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
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
const CONTENT_TEXT_JSON_LIMIT = 20000;
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

async function materializeSkill({ skillPath, skillMarkdown, skillName = "aily-inline-skill" }) {
  if (skillMarkdown) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "skill-eval-inline-"));
    const skillDir = path.join(base, sanitizeName(skillName));
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMarkdown);
    return skillDir;
  }
  if (!skillPath) throw new Error("Provide either skillPath or skillMarkdown.");
  return assertAllowedPath(skillPath);
}

function sanitizeName(name) {
  return String(name || "skill").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "skill";
}

async function readJsonInput({ filePath, value, label }) {
  if (value) return value;
  if (!filePath) throw new Error(`Provide either ${label}Path or ${label}.`);
  return readJson(assertAllowedPath(filePath));
}

async function tryWriteJson(outputPath, value) {
  if (!outputPath) return null;
  try {
    const resolved = assertAllowedPath(outputPath);
    await writeJson(resolved, value);
    return { requested: true, written: true, path: resolved };
  } catch (error) {
    return outputPathWarning(outputPath, error);
  }
}

async function tryWriteText(outputPath, value) {
  if (!outputPath) return null;
  try {
    const { writeText } = await import("../../core/src/index.js");
    const resolved = assertAllowedPath(outputPath);
    await writeText(resolved, value);
    return { requested: true, written: true, path: resolved };
  } catch (error) {
    return outputPathWarning(outputPath, error);
  }
}

function outputPathWarning(outputPath, error) {
  return {
    requested: true,
    written: false,
    path: outputPath,
    error: error instanceof Error ? error.message : String(error),
    guidance: "Aily sandbox paths are not writable by this MCP server. Use the JSON_RESULT returned in content.text, or choose a path inside SKILL_EVAL_ALLOWED_ROOTS.",
  };
}

function resultPayload(value, summary = "ok", outputPathStatus = null) {
  const compact = compactValue(value);
  return {
    structuredContent: compact,
    content: [
      {
        type: "text",
        text: formatContentText(summary, compact, outputPathStatus),
      },
    ],
  };
}

function formatContentText(summary, value, outputPathStatus) {
  const summaryText = typeof summary === "string" ? summary : JSON.stringify(summary, null, 2);
  const outputText = outputPathStatus
    ? `\n\nOUTPUT_PATH_STATUS:\n${JSON.stringify(outputPathStatus, null, 2)}`
    : "";
  const json = JSON.stringify(value, null, 2);
  if (json.length <= CONTENT_TEXT_JSON_LIMIT) {
    return `${summaryText}${outputText}\n\nJSON_RESULT:\n${json}`;
  }
  return `${summaryText}${outputText}\n\nJSON_RESULT_TRUNCATED:\n${json.slice(0, CONTENT_TEXT_JSON_LIMIT)}\n...`;
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
    description: "Static skill-only evaluation. For Aily, prefer skillMarkdown instead of sandbox file paths.",
    inputSchema: {
      skillPath: z.string().optional().describe("Local server path to a skill directory containing SKILL.md."),
      skillMarkdown: z.string().optional().describe("Inline SKILL.md content. Preferred when Aily has the file in its own sandbox."),
      skillName: z.string().optional().describe("Name used when skillMarkdown is provided."),
      outputPath: z.string().optional().describe("Optional local server path to write full evaluation JSON. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ skillPath, skillMarkdown, skillName, outputPath }) => {
    const result = await analyzeSkill(await materializeSkill({ skillPath, skillMarkdown, skillName }));
    const outputPathStatus = await tryWriteJson(outputPath, result);
    return resultPayload(result, `Analyzed skill ${result.target.name}. Score: ${result.summary.overallScore}. Risk: ${result.summary.riskLevel}.`, outputPathStatus);
  });

  server.registerTool("init_skill_benchmark", {
    title: "Initialize Skill Benchmark",
    description: "Create a starter benchmark with happy-path, follow-up, and boundary-case scenarios.",
    inputSchema: {
      skillPath: z.string().optional(),
      skillMarkdown: z.string().optional().describe("Inline SKILL.md content. Preferred for Aily."),
      skillName: z.string().optional(),
      runner: z.enum(["claude-code", "aily"]).default("aily"),
      workspacePath: z.string().optional(),
      command: z.string().optional(),
      outputPath: z.string().optional().describe("Optional local server path to write benchmark JSON. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ skillPath, skillMarkdown, skillName, runner, workspacePath, command, outputPath }) => {
    const benchmark = createStarterBenchmark(await materializeSkill({ skillPath, skillMarkdown, skillName }), {
      runner,
      workspace: workspacePath ? assertAllowedPath(workspacePath) : undefined,
      command,
    });
    const outputPathStatus = await tryWriteJson(outputPath, benchmark);
    return resultPayload(benchmark, `Created benchmark for ${benchmark.target.name} with ${benchmark.scenarios.length} starter scenarios.`, outputPathStatus);
  });

  server.registerTool("run_skill_benchmark", {
    title: "Run Skill Benchmark",
    description: "Run benchmark through a CLI-command runner. Disabled unless SKILL_EVAL_MCP_ENABLE_RUNNER=true.",
    inputSchema: {
      configPath: z.string().optional(),
      benchmarkConfig: z.record(z.any()).optional().describe("Inline benchmark config JSON. Preferred for Aily."),
      runner: z.enum(["claude-code", "aily"]).default("aily"),
      outputPath: z.string().optional().describe("Optional local server path to write benchmark run JSON. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ configPath, benchmarkConfig, runner, outputPath }) => {
    if (!ENABLE_RUNNER) {
      return resultPayload({
        blocked: true,
        reason: "Benchmark execution is disabled for MCP safety.",
        enable: "Set SKILL_EVAL_MCP_ENABLE_RUNNER=true on the server.",
      }, "Benchmark execution is disabled. Enable SKILL_EVAL_MCP_ENABLE_RUNNER=true to run agent commands.");
    }
    const adapter = runner === "aily" ? new AilyRunner() : new ClaudeCodeRunner();
    const resolvedConfigPath = benchmarkConfig
      ? await writeInlineBenchmarkConfig(benchmarkConfig)
      : assertAllowedPath(configPath);
    const result = await runBenchmark(resolvedConfigPath, adapter);
    const outputPathStatus = await tryWriteJson(outputPath, result);
    return resultPayload(result, `Benchmark complete. Score: ${result.summary.benchmarkScore}. Completed: ${result.summary.completed}/${result.summary.scenarioCount}.`, outputPathStatus);
  });

  server.registerTool("score_benchmark_result", {
    title: "Score Benchmark Result",
    description: "Read a benchmark-run JSON and return its summary.",
    inputSchema: {
      benchmarkRunPath: z.string().optional(),
      benchmarkRun: z.record(z.any()).optional().describe("Inline benchmark-run JSON. Preferred for Aily."),
    },
  }, async ({ benchmarkRunPath, benchmarkRun }) => {
    const run = await readJsonInput({ filePath: benchmarkRunPath, value: benchmarkRun, label: "benchmarkRun" });
    return resultPayload(run.summary, `Benchmark score: ${run.summary?.benchmarkScore ?? "unknown"}.`);
  });

  server.registerTool("compare_skill_versions", {
    title: "Compare Skill Versions",
    description: "Compare two skill evaluation JSON files.",
    inputSchema: {
      beforePath: z.string().optional(),
      afterPath: z.string().optional(),
      beforeEvaluation: z.record(z.any()).optional().describe("Inline before evaluation JSON."),
      afterEvaluation: z.record(z.any()).optional().describe("Inline after evaluation JSON."),
      outputPath: z.string().optional().describe("Optional local server path to write compare JSON. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ beforePath, afterPath, beforeEvaluation, afterEvaluation, outputPath }) => {
    const report = compareEvaluations(
      await readJsonInput({ filePath: beforePath, value: beforeEvaluation, label: "beforeEvaluation" }),
      await readJsonInput({ filePath: afterPath, value: afterEvaluation, label: "afterEvaluation" }),
    );
    const outputPathStatus = await tryWriteJson(outputPath, report);
    return resultPayload(report, `Compare complete. Delta: ${report.delta.overallScore}.`, outputPathStatus);
  });

  server.registerTool("suggest_skill_improvements", {
    title: "Suggest Skill Improvements",
    description: "Generate an improvement brief from an evaluation result.",
    inputSchema: {
      evaluationResultPath: z.string().optional(),
      evaluationResult: z.record(z.any()).optional().describe("Inline evaluation result JSON. Preferred for Aily."),
      outputPath: z.string().optional().describe("Optional local server path to write improvement JSON. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ evaluationResultPath, evaluationResult, outputPath }) => {
    const brief = buildImprovementBrief(await readJsonInput({ filePath: evaluationResultPath, value: evaluationResult, label: "evaluationResult" }));
    const outputPathStatus = await tryWriteJson(outputPath, brief);
    return resultPayload(brief, `Improvement brief generated for ${brief.target.name}.`, outputPathStatus);
  });

  server.registerTool("generate_review_packet", {
    title: "Generate Review Packet",
    description: "Generate a PM-readable review packet from evaluation and optional benchmark evidence.",
    inputSchema: {
      evaluationResultPath: z.string().optional(),
      evaluationResult: z.record(z.any()).optional().describe("Inline evaluation result JSON. Preferred for Aily."),
      benchmarkRunPath: z.string().optional(),
      benchmarkRun: z.record(z.any()).optional().describe("Inline benchmark-run JSON."),
      outputPath: z.string().optional().describe("Optional local server path to write review packet markdown. Aily sandbox paths are reported but do not fail the tool."),
    },
  }, async ({ evaluationResultPath, evaluationResult, benchmarkRunPath, benchmarkRun, outputPath }) => {
    const evaluation = await readJsonInput({ filePath: evaluationResultPath, value: evaluationResult, label: "evaluationResult" });
    const benchmark = benchmarkRun || (benchmarkRunPath ? await readJson(assertAllowedPath(benchmarkRunPath)) : null);
    const packet = renderReviewPacket(evaluation, benchmark);
    const outputPathStatus = await tryWriteText(outputPath, packet);
    return resultPayload({ packet, user: meta }, "Review packet generated.", outputPathStatus);
  });

  return server;
}

async function writeInlineBenchmarkConfig(config) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skill-eval-inline-benchmark-"));
  const configPath = path.join(base, "benchmark.json");
  await writeJson(configPath, config);
  return configPath;
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
