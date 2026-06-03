export function compareEvaluations(before, after) {
  const beforeChecks = new Map(before.checks.map((check) => [check.id, check.status]));
  const afterChecks = new Map(after.checks.map((check) => [check.id, check.status]));
  const ids = new Set([...beforeChecks.keys(), ...afterChecks.keys()]);
  const changedChecks = [];
  for (const id of ids) {
    const beforeStatus = beforeChecks.get(id);
    const afterStatus = afterChecks.get(id);
    if (beforeStatus !== afterStatus) {
      changedChecks.push({ id, before: beforeStatus, after: afterStatus });
    }
  }
  const delta = {
    overallScore: after.summary.overallScore - before.summary.overallScore,
    staticScore: after.summary.staticScore - before.summary.staticScore,
    benchmarkScore: (after.summary.benchmarkScore || 0) - (before.summary.benchmarkScore || 0),
  };
  return {
    schemaVersion: 1,
    kind: "skill-compare-report",
    createdAt: new Date().toISOString(),
    before,
    after,
    delta,
    changedChecks,
    recommendation: delta.overallScore > 0 ? "improved" : delta.overallScore < 0 ? "regressed" : "unchanged",
  };
}
