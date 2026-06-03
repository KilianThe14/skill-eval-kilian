#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const workspace = process.env.SKILL_EVAL_WORKSPACE;
const scenarioId = process.env.SKILL_EVAL_SCENARIO_ID;
await fs.writeFile(path.join(workspace, "skill-output.txt"), `scenario=${scenarioId}\n`);
process.stdout.write(JSON.stringify({
  finalAnswer: `Completed ${scenarioId}`,
  toolCalls: [{ name: "writeFile", status: "passed" }],
  artifacts: [{ path: "skill-output.txt", type: "file" }],
  telemetry: { toolCallCount: 1, failedToolCallCount: 0 }
}));
