import { spawn } from "node:child_process";
import path from "node:path";

export class ClaudeCodeRunner {
  constructor(options = {}) {
    this.name = "claude-code";
    this.command = options.command || null;
  }

  async runScenario({ config, scenario, workspacePath, runPath, skillPath }) {
    const command = config.runner.command || this.command;
    if (!command) {
      return unavailable("Claude Code runner requires config.runner.command for this implementation.");
    }
    return runAgentCommand(command, {
      scenario,
      workspacePath,
      runPath,
      skillPath,
      runner: this.name,
    });
  }
}

async function runAgentCommand(command, context) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SKILL_EVAL_RUNNER: context.runner,
      SKILL_EVAL_SCENARIO_ID: context.scenario.id,
      SKILL_EVAL_USER_INPUT: context.scenario.userInput,
      SKILL_EVAL_WORKSPACE: context.workspacePath,
      SKILL_EVAL_RUN_PATH: context.runPath,
      SKILL_EVAL_SKILL_PATH: context.skillPath,
    };
    const child = spawn(command, { cwd: context.workspacePath, shell: true, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "completed" : "failed",
        finalAnswer: stdout.trim() || stderr.trim(),
        logs: { eventsPath: path.join(context.runPath, "events.jsonl") },
        toolCalls: [],
        artifacts: [],
        telemetry: { exitCode: code, stderrPreview: stderr.slice(0, 500) },
      });
    });
  });
}

function unavailable(message) {
  return {
    status: "failed",
    finalAnswer: message,
    toolCalls: [],
    artifacts: [],
    telemetry: { error: "runner-unavailable" },
  };
}
