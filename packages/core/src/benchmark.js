import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyDirectory, diffSnapshots, pathExists, readJson, snapshotWorkspace, writeJson, writeText } from "./files.js";
import { scoreBenchmarkRun } from "./scoring.js";

export function createStarterBenchmark(skillPath, options = {}) {
  const absolutePath = path.resolve(skillPath);
  const name = path.basename(absolutePath);
  return {
    kind: "skill-eval-benchmark",
    schemaVersion: 1,
    target: {
      type: "skill",
      name,
      path: absolutePath,
    },
    runner: {
      type: options.runner || "claude-code",
      command: options.command || null,
    },
    workspace: {
      sourcePath: path.resolve(options.workspace || process.cwd()),
      setupMode: "copy",
      preserve: "on-failure",
    },
    scenarios: [
      {
        id: "happy-path",
        title: "Happy path implementation",
        purpose: "Run a representative task that should clearly justify using this skill.",
        userInput: "Use the target skill if it helps. Complete a representative task for this skill in the current workspace and leave the result on disk.",
        successChecklist: [
          "The task is completed on disk.",
          "The final answer explains what changed.",
          "The result stays inside the skill's intended scope.",
        ],
        verifiers: [],
      },
      {
        id: "follow-up",
        title: "Focused refinement",
        purpose: "Measure whether the skill can improve an existing result without restarting from scratch.",
        userInput: "Use the target skill if it helps. Refine or extend the current workspace with one focused follow-up improvement and finish the change end to end.",
        successChecklist: [
          "The result makes a concrete change on disk.",
          "The follow-up remains scoped and coherent.",
          "The final answer distinguishes what was reused from what was changed.",
        ],
        verifiers: [],
      },
      {
        id: "boundary-case",
        title: "Boundary handling",
        purpose: "Check whether the skill avoids overreaching when the task is only a partial fit.",
        userInput: "This task is only a partial match for the target skill. Handle the appropriate slice in the workspace and narrow or refuse the rest honestly.",
        successChecklist: [
          "The run sets good boundaries instead of pretending the skill fits everything.",
          "Any edits stay aligned with the justified scope.",
          "The final answer explains what was handled and what was intentionally left out.",
        ],
        verifiers: [],
      },
    ],
  };
}

export async function runBenchmark(configPath, runner) {
  const config = await readJson(path.resolve(configPath));
  validateBenchmarkConfig(config);
  const runId = new Date().toISOString().replaceAll(":", "-").replace(/\..+$/, "");
  const runPath = path.resolve(path.dirname(configPath), ".skill-eval", "runs", runId);
  await fs.mkdir(runPath, { recursive: true });
  const scenarios = [];

  for (const scenario of config.scenarios) {
    const scenarioPath = path.join(runPath, scenario.id);
    const workspacePath = path.join(scenarioPath, "workspace");
    await fs.mkdir(scenarioPath, { recursive: true });
    await copyDirectory(path.resolve(config.workspace.sourcePath), workspacePath);
    const before = await snapshotWorkspace(workspacePath);
    const startedAt = Date.now();
    const run = await runner.runScenario({
      config,
      scenario,
      workspacePath,
      runPath: scenarioPath,
      skillPath: path.resolve(config.target.path),
    });
    const after = await snapshotWorkspace(workspacePath);
    const workspaceDiff = diffSnapshots(before, after);
    const verifiers = await runVerifiers(scenario.verifiers || [], workspacePath, scenarioPath);
    const checklist = scoreChecklist(scenario.successChecklist || [], run, workspaceDiff, verifiers);
    const status = run.status === "completed" && verifiers.every((item) => item.status === "passed") ? "completed" : "failed";
    await writeText(path.join(scenarioPath, "final-answer.txt"), run.finalAnswer || "");
    await writeJson(path.join(scenarioPath, "workspace-diff.json"), workspaceDiff);
    scenarios.push({
      id: scenario.id,
      title: scenario.title,
      purpose: scenario.purpose,
      status,
      durationMs: Date.now() - startedAt,
      finalAnswerPreview: (run.finalAnswer || "").slice(0, 300),
      checklist,
      verifiers,
      toolCalls: run.toolCalls || [],
      mcpCalls: run.mcpCalls || [],
      permissionEvents: run.permissionEvents || [],
      contextEvents: run.contextEvents || [],
      workspaceDiff,
      artifacts: run.artifacts || [],
      logs: {
        eventsPath: run.logs?.eventsPath || null,
        finalAnswerPath: path.join(scenarioPath, "final-answer.txt"),
      },
      telemetry: run.telemetry || {},
    });
  }

  const score = scoreBenchmarkRun({ scenarios });
  const summary = {
    scenarioCount: scenarios.length,
    completed: scenarios.filter((scenario) => scenario.status === "completed").length,
    failed: scenarios.filter((scenario) => scenario.status !== "completed").length,
    verifierPassed: scenarios.flatMap((scenario) => scenario.verifiers).filter((verifier) => verifier.status === "passed").length,
    verifierFailed: scenarios.flatMap((scenario) => scenario.verifiers).filter((verifier) => verifier.status === "failed").length,
    checklistPassRate: checklistPassRate(scenarios),
    benchmarkScore: score.benchmarkScore,
    riskLevel: score.riskLevel,
  };
  const payload = {
    schemaVersion: 1,
    kind: "skill-benchmark-run",
    createdAt: new Date().toISOString(),
    target: config.target,
    runner: {
      type: config.runner.type,
      command: config.runner.command || null,
    },
    workspace: {
      sourcePath: path.resolve(config.workspace.sourcePath),
      runPath,
      preserve: config.workspace.preserve || "on-failure",
    },
    summary,
    scenarios,
  };
  await writeJson(path.join(runPath, "benchmark-run.json"), payload);
  return payload;
}

function validateBenchmarkConfig(config) {
  if (config.kind !== "skill-eval-benchmark") throw new Error("Invalid benchmark kind.");
  if (config.target?.type !== "skill") throw new Error("Benchmark target must be a skill.");
  if (!config.runner?.type) throw new Error("Benchmark runner.type is required.");
  if (!config.workspace?.sourcePath) throw new Error("Benchmark workspace.sourcePath is required.");
  if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) throw new Error("Benchmark scenarios are required.");
}

async function runVerifiers(verifiers, cwd, scenarioPath) {
  const results = [];
  for (const [index, verifier] of verifiers.entries()) {
    if (verifier.type !== "command") continue;
    const stdoutPath = path.join(scenarioPath, `verifier-${index}.stdout.log`);
    const stderrPath = path.join(scenarioPath, `verifier-${index}.stderr.log`);
    const child = await runCommand(verifier.command, cwd, verifier.timeoutMs || 30000);
    await writeText(stdoutPath, child.stdout);
    await writeText(stderrPath, child.stderr);
    results.push({
      type: "command",
      command: verifier.command,
      status: child.code === 0 ? "passed" : "failed",
      exitCode: child.code,
      stdoutPath,
      stderrPath,
    });
  }
  return results;
}

async function runCommand(command, cwd, timeoutMs) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\nTimed out after ${timeoutMs}ms`;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function scoreChecklist(items, run, workspaceDiff, verifiers) {
  return items.map((item) => {
    const hasEvidence = run.status === "completed" && (workspaceDiff.length > 0 || verifiers.some((verifier) => verifier.status === "passed"));
    return {
      item,
      status: hasEvidence ? "pass" : "unknown",
      evidence: hasEvidence ? "Runner completed and produced workspace/verifier evidence." : "No direct evidence collected.",
    };
  });
}

function checklistPassRate(scenarios) {
  const items = scenarios.flatMap((scenario) => scenario.checklist || []);
  if (items.length === 0) return 0;
  return Number((items.filter((item) => item.status === "pass").length / items.length).toFixed(2));
}

export async function createIsolatedWorkspace(sourcePath) {
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "skill-eval-")), "workspace");
  await copyDirectory(sourcePath, target);
  return target;
}
