export function buildImprovementBrief(result) {
  const requiredFixes = result.checks
    .filter((check) => check.status === "fail")
    .map((check) => ({ id: check.id, message: check.message, remediation: check.remediation }));
  const recommendedFixes = result.checks
    .filter((check) => check.status === "warn")
    .map((check) => ({ id: check.id, message: check.message, remediation: check.remediation }));
  return {
    schemaVersion: 1,
    kind: "skill-improvement-brief",
    createdAt: new Date().toISOString(),
    target: result.target,
    summary: `Improve ${result.target.name} from ${result.summary.grade} (${result.summary.overallScore}/100).`,
    requiredFixes,
    recommendedFixes,
    suggestedPrompt: [
      `Improve the skill ${result.target.name}.`,
      "Keep the skill focused on clear triggers, boundaries, workflow, verification, and supporting files.",
      ...requiredFixes.map((fix) => `Fix ${fix.id}: ${fix.message}`),
      ...recommendedFixes.slice(0, 5).map((fix) => `Consider ${fix.id}: ${fix.message}`),
    ].join(" "),
  };
}
