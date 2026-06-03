export function createCheck({ id, category, severity = "warning", status = "warn", message, evidence = [], remediation = [] }) {
  return { id, category, severity, status, message, evidence, remediation };
}

export function createMetric({ id, category, value, unit, band = "info" }) {
  return { id, category, value, unit, band };
}

export function gradeForScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function recommendationForScore(score, riskLevel) {
  if (riskLevel === "blocked") return "blocked";
  if (score >= 90 && riskLevel === "low") return "ship";
  if (score >= 80) return "pilot";
  if (score >= 70) return "revise-before-release";
  return "rebuild";
}
