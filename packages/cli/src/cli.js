#!/usr/bin/env node
import path from "node:path";
import {
  analyzeSkill,
  buildImprovementBrief,
  combineEvaluationAndBenchmark,
  compareEvaluations,
  createStarterBenchmark,
  readJson,
  renderMarkdown,
  renderReviewPacket,
  runBenchmark,
  writeJson,
  writeText,
} from "../../core/src/index.js";
import { ClaudeCodeRunner } from "../../runner-claude-code/src/index.js";
import { AilyRunner } from "../../runner-aily/src/index.js";

function usage() {
  return `Skill Eval Framework

Commands:
  skill-eval analyze <skill-path> [--format json|markdown] [--output <file>]
  skill-eval init-benchmark <skill-path> [--runner claude-code|aily] [--workspace <path>] [--command <cmd>] [--output <file>]
  skill-eval run-benchmark --runner claude-code|aily --config <benchmark.json> [--output <file>]
  skill-eval report <result.json> [--format json|markdown] [--output <file>]
  skill-eval compare <before.json> <after.json> [--format json|markdown] [--output <file>]
  skill-eval improve <result.json> [--format json|markdown] [--output <file>]
  skill-eval review-packet <evaluation.json> [benchmark-run.json] [--output <file>]
`;
}

function parse(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (["format", "output", "runner", "config", "workspace", "command"].includes(key)) {
        options[key] = argv[i + 1];
        i += 1;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

async function emit(payload, options = {}) {
  const format = options.format || "json";
  const rendered = format === "markdown" ? renderMarkdown(payload) : `${JSON.stringify(payload, null, 2)}\n`;
  if (options.output) {
    if (format === "json") await writeJson(path.resolve(options.output), payload);
    else await writeText(path.resolve(options.output), rendered);
    return;
  }
  process.stdout.write(rendered);
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  const { positional, options } = parse(rest);

  if (command === "analyze") {
    if (!positional[0]) throw new Error("Missing skill path.");
    await emit(await analyzeSkill(positional[0]), options);
    return;
  }

  if (command === "init-benchmark") {
    if (!positional[0]) throw new Error("Missing skill path.");
    const benchmark = createStarterBenchmark(positional[0], {
      runner: options.runner,
      workspace: options.workspace,
      command: options.command,
    });
    if (options.output) await writeJson(path.resolve(options.output), benchmark);
    else process.stdout.write(`${JSON.stringify(benchmark, null, 2)}\n`);
    return;
  }

  if (command === "run-benchmark") {
    if (!options.config) throw new Error("Missing --config.");
    if (!options.runner) throw new Error("Missing --runner.");
    const runner = options.runner === "aily" ? new AilyRunner() : new ClaudeCodeRunner();
    await emit(await runBenchmark(options.config, runner), options);
    return;
  }

  if (command === "report") {
    if (!positional[0]) throw new Error("Missing result path.");
    await emit(await readJson(path.resolve(positional[0])), options);
    return;
  }

  if (command === "compare") {
    if (!positional[0] || !positional[1]) throw new Error("Missing before/after paths.");
    const before = await readJson(path.resolve(positional[0]));
    const after = await readJson(path.resolve(positional[1]));
    await emit(compareEvaluations(before, after), options);
    return;
  }

  if (command === "improve") {
    if (!positional[0]) throw new Error("Missing result path.");
    const brief = buildImprovementBrief(await readJson(path.resolve(positional[0])));
    if ((options.format || "json") === "markdown") {
      const md = `# Improvement Brief: ${brief.target.name}\n\n${brief.summary}\n\n## Required Fixes\n\n${brief.requiredFixes.map((fix) => `- ${fix.message}`).join("\n") || "- None"}\n\n## Recommended Fixes\n\n${brief.recommendedFixes.map((fix) => `- ${fix.message}`).join("\n") || "- None"}\n`;
      if (options.output) await writeText(path.resolve(options.output), md);
      else process.stdout.write(md);
    } else {
      await emit(brief, options);
    }
    return;
  }

  if (command === "review-packet") {
    if (!positional[0]) throw new Error("Missing evaluation result path.");
    const evaluation = await readJson(path.resolve(positional[0]));
    const benchmark = positional[1] ? await readJson(path.resolve(positional[1])) : null;
    const merged = benchmark ? combineEvaluationAndBenchmark(evaluation, benchmark) : evaluation;
    const md = renderReviewPacket(merged, benchmark);
    if (options.output) await writeText(path.resolve(options.output), md);
    else process.stdout.write(md);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
