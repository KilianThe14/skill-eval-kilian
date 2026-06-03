import { spawn } from "node:child_process";
import path from "node:path";

export const AILY_FULL_CAPABILITY_INTERFACES = [
  "createSession",
  "configureEnvironment",
  "installSkill",
  "listAvailableTools",
  "configureTools",
  "listAvailableSkills",
  "configureSkills",
  "listMcpServers",
  "configureMcpServers",
  "uploadWorkspace",
  "snapshotWorkspace",
  "runTask",
  "sendFollowUp",
  "getTaskStatus",
  "getFinalAnswer",
  "listMessages",
  "listToolCalls",
  "listMcpCalls",
  "listPermissionEvents",
  "listContextEvents",
  "listArtifacts",
  "downloadArtifact",
  "exportWorkspaceDiff",
  "runVerifier",
  "exportRunLog",
  "exportTelemetry",
  "cleanupSession",
];

export class AilyRunner {
  constructor(options = {}) {
    this.name = "aily";
    this.command = options.command || null;
  }

  async runScenario({ config, scenario, workspacePath, runPath, skillPath }) {
    const command = config.runner.command || this.command;
    if (!command) {
      return {
        status: "failed",
        finalAnswer: "Aily runner requires config.runner.command until native Aily APIs are wired.",
        messages: [],
        toolCalls: [],
        mcpCalls: [],
        permissionEvents: [],
        contextEvents: [],
        artifacts: [],
        telemetry: { error: "runner-unavailable", requiredInterfaces: AILY_FULL_CAPABILITY_INTERFACES },
      };
    }
    return runAilyCommand(command, { config, scenario, workspacePath, runPath, skillPath });
  }
}

async function runAilyCommand(command, context) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SKILL_EVAL_RUNNER: "aily",
      SKILL_EVAL_SCENARIO_ID: context.scenario.id,
      SKILL_EVAL_USER_INPUT: context.scenario.userInput,
      SKILL_EVAL_WORKSPACE: context.workspacePath,
      SKILL_EVAL_RUN_PATH: context.runPath,
      SKILL_EVAL_SKILL_PATH: context.skillPath,
      SKILL_EVAL_AILY_INTERFACE_LIST: AILY_FULL_CAPABILITY_INTERFACES.join(","),
    };
    const child = spawn(command, { cwd: context.workspacePath, shell: true, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      resolve({
        status: code === 0 ? "completed" : "failed",
        finalAnswer: parsed?.finalAnswer || stdout.trim() || stderr.trim(),
        messages: parsed?.messages || [],
        toolCalls: parsed?.toolCalls || [],
        mcpCalls: parsed?.mcpCalls || [],
        permissionEvents: parsed?.permissionEvents || [],
        contextEvents: parsed?.contextEvents || [],
        artifacts: parsed?.artifacts || [],
        logs: { eventsPath: path.join(context.runPath, "events.jsonl") },
        telemetry: parsed?.telemetry || { exitCode: code, stderrPreview: stderr.slice(0, 500) },
      });
    });
  });
}
