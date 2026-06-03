import { gradeForScore, recommendationForScore } from "./schema.js";

export function scoreBenchmarkRun(run) {
  const scenarios = run.scenarios || [];
  if (scenarios.length === 0) return { benchmarkScore: null, riskLevel: "blocked" };

  const completed = scenarios.filter((scenario) => scenario.status === "completed").length;
  const scenarioScore = (completed / scenarios.length) * 18;

  const verifiers = scenarios.flatMap((scenario) => scenario.verifiers || []);
  const verifierPassed = verifiers.filter((verifier) => verifier.status === "passed").length;
  const verifierScore = verifiers.length === 0 ? 8 : (verifierPassed / verifiers.length) * 15;

  const checklist = scenarios.flatMap((scenario) => scenario.checklist || []);
  const checklistPassed = checklist.filter((item) => item.status === "pass").length;
  const checklistScore = checklist.length === 0 ? 0 : (checklistPassed / checklist.length) * 12;

  const outputScore = scenarios.some((scenario) => (scenario.workspaceDiff || []).length > 0) ? 8 : 0;
  const toolFailures = scenarios.flatMap((scenario) => scenario.toolCalls || []).filter((call) => call.status === "failed").length;
  const toolScore = toolFailures === 0 ? 5 : 2;
  const boundary = scenarios.find((scenario) => scenario.id === "boundary-case");
  const boundaryScore = boundary?.status === "completed" ? 5 : 0;
  const stabilityScore = scenarios.length > 1 ? 2 : 0;

  let benchmarkScore = Math.round(((scenarioScore + verifierScore + checklistScore + outputScore + toolScore + boundaryScore + stabilityScore) / 65) * 100);
  if (verifiers.length > 0 && verifierPassed === 0) benchmarkScore = Math.min(benchmarkScore, 40);
  if (scenarios.find((scenario) => scenario.id === "happy-path")?.status !== "completed") benchmarkScore = Math.min(benchmarkScore, 55);

  const riskLevel = benchmarkScore >= 85 ? "low" : benchmarkScore >= 70 ? "medium" : "high";
  return { benchmarkScore, riskLevel };
}

export function combineEvaluationAndBenchmark(evaluation, benchmarkRun) {
  const benchmark = scoreBenchmarkRun(benchmarkRun);
  const staticScore = evaluation.summary.staticScore;
  const overallScore = benchmark.benchmarkScore == null
    ? staticScore
    : Math.round(staticScore * 0.35 + benchmark.benchmarkScore * 0.65);
  const riskLevel = [evaluation.summary.riskLevel, benchmark.riskLevel].includes("high")
    ? "high"
    : [evaluation.summary.riskLevel, benchmark.riskLevel].includes("medium")
      ? "medium"
      : "low";
  return {
    ...evaluation,
    summary: {
      ...evaluation.summary,
      overallScore,
      benchmarkScore: benchmark.benchmarkScore,
      grade: gradeForScore(overallScore),
      riskLevel,
      recommendation: recommendationForScore(overallScore, riskLevel),
    },
  };
}
