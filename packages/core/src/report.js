export function renderMarkdown(payload) {
  if (payload.kind === "skill-evaluation-result") return renderEvaluation(payload);
  if (payload.kind === "skill-benchmark-run") return renderBenchmark(payload);
  if (payload.kind === "skill-compare-report") return renderCompare(payload);
  return `# Skill Eval Report\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

function renderEvaluation(result) {
  return `# Skill Evaluation: ${result.target.name}

## At a Glance

- Overall score: ${result.summary.overallScore}
- Static score: ${result.summary.staticScore}
- Benchmark score: ${result.summary.benchmarkScore ?? "not run"}
- Grade: ${result.summary.grade}
- Risk: ${result.summary.riskLevel}
- Recommendation: ${result.summary.recommendation}

## Fix First

${result.summary.topIssues.length ? result.summary.topIssues.map((issue) => `- [${issue.status}] ${issue.message}`).join("\n") : "- No blocking issues found."}

## Checks

${result.checks.map((check) => `- [${check.status}] ${check.id}: ${check.message}`).join("\n")}
`;
}

function renderBenchmark(run) {
  return `# Skill Benchmark Run: ${run.target.name}

## Summary

- Runner: ${run.runner.type}
- Scenarios: ${run.summary.scenarioCount}
- Completed: ${run.summary.completed}
- Failed: ${run.summary.failed}
- Benchmark score: ${run.summary.benchmarkScore}
- Risk: ${run.summary.riskLevel}

## Scenarios

${run.scenarios.map((scenario) => `- ${scenario.id}: ${scenario.status} (${scenario.durationMs}ms)`).join("\n")}
`;
}

function renderCompare(report) {
  return `# Skill Compare Report

## Summary

- Before score: ${report.before.summary.overallScore}
- After score: ${report.after.summary.overallScore}
- Delta: ${report.delta.overallScore}
- Recommendation: ${report.recommendation}

## Changed Checks

${report.changedChecks.length ? report.changedChecks.map((check) => `- ${check.id}: ${check.before || "none"} -> ${check.after || "none"}`).join("\n") : "- No check status changes."}
`;
}

export function renderReviewPacket(evaluation, benchmarkRun = null) {
  const benchmarkSummary = benchmarkRun
    ? `- Benchmark score: ${benchmarkRun.summary.benchmarkScore}\n- Completed scenarios: ${benchmarkRun.summary.completed}/${benchmarkRun.summary.scenarioCount}\n- Checklist pass rate: ${benchmarkRun.summary.checklistPassRate}`
    : "- Benchmark was not run.";
  return `# Review Packet: ${evaluation.target.name}

## Decision Summary

- Recommendation: ${evaluation.summary.recommendation}
- Overall score: ${evaluation.summary.overallScore}
- Risk: ${evaluation.summary.riskLevel}

## Static Evaluation

- Static score: ${evaluation.summary.staticScore}
- Grade: ${evaluation.summary.grade}

## Benchmark Evidence

${benchmarkSummary}

## Fix First

${evaluation.summary.topIssues.length ? evaluation.summary.topIssues.map((issue) => `- ${issue.message}`).join("\n") : "- No high-priority issues."}

## Release Gate

- Ship: score >= 90 and low risk.
- Pilot: score >= 80 with no high-risk benchmark failure.
- Revise: score 70-79 or medium risk.
- Rebuild: score < 70 or high risk.
`;
}
