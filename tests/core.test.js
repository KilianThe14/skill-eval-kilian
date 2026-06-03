import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { analyzeSkill, createStarterBenchmark, runBenchmark } from "../packages/core/src/index.js";
import { ClaudeCodeRunner } from "../packages/runner-claude-code/src/index.js";

const root = path.resolve(".");
const sampleSkill = path.join(root, "examples/skills/sample-skill");

test("analyzeSkill returns skill-only evaluation result", async () => {
  const result = await analyzeSkill(sampleSkill);
  assert.equal(result.kind, "skill-evaluation-result");
  assert.equal(result.target.type, "skill");
  assert.ok(result.summary.staticScore > 70);
  assert.equal(result.summary.benchmarkScore, null);
});

test("createStarterBenchmark keeps all three starter scenarios", () => {
  const benchmark = createStarterBenchmark(sampleSkill);
  assert.deepEqual(benchmark.scenarios.map((scenario) => scenario.id), ["happy-path", "follow-up", "boundary-case"]);
});

test("runBenchmark uses CLI command runner and produces shared result schema", async () => {
  const benchmark = createStarterBenchmark(sampleSkill, {
    workspace: path.join(root, "examples/workspace"),
    command: `node ${path.join(root, "examples/fake-agent-runner.js")}`,
  });
  const fs = await import("node:fs/promises");
  const configPath = path.join(root, "examples/benchmarks/test-benchmark.json");
  await fs.writeFile(configPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  const result = await runBenchmark(configPath, new ClaudeCodeRunner());
  assert.equal(result.kind, "skill-benchmark-run");
  assert.equal(result.runner.type, "claude-code");
  assert.equal(result.summary.scenarioCount, 3);
  assert.ok(result.summary.completed >= 1);
});
