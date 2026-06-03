import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { pathExists, readText, walkFiles } from "./files.js";
import { createCheck, createMetric, gradeForScore, recommendationForScore } from "./schema.js";

function findRelativeLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#|app:\/\/|plugin:\/\/|rules:\/\/)/.test(target));
}

function hasBoundaryLanguage(text) {
  return /(do not|don't|refuse|boundary|only|scope|不适用|不要|拒绝|边界|范围)/i.test(text);
}

function hasWorkflowLanguage(text) {
  return /(step|workflow|process|run|execute|步骤|流程|执行|检查)/i.test(text);
}

function hasVerificationLanguage(text) {
  return /(verify|test|check|acceptance|success|done|验收|验证|测试|成功)/i.test(text);
}

function computeStaticScore(checks) {
  const weights = {
    structure: 6,
    trigger: 6,
    boundary: 5,
    workflow: 5,
    verification: 5,
    support: 4,
    links: 4,
  };
  const lost = new Map(Object.keys(weights).map((key) => [key, 0]));
  for (const check of checks) {
    const penalty = check.status === "fail" ? weights[check.category] ?? 4 : Math.ceil((weights[check.category] ?? 4) / 2);
    lost.set(check.category, Math.min(weights[check.category] ?? 4, (lost.get(check.category) || 0) + penalty));
  }
  const raw = Object.entries(weights).reduce((sum, [key, value]) => sum + value - (lost.get(key) || 0), 0);
  return Math.max(0, Math.round((raw / 35) * 100));
}

function riskForChecks(checks) {
  if (checks.some((check) => check.status === "fail" && ["structure"].includes(check.category))) return "high";
  if (checks.some((check) => check.status === "fail")) return "high";
  if (checks.some((check) => check.status === "warn")) return "medium";
  return "low";
}

export async function analyzeSkill(skillPath) {
  const absolutePath = path.resolve(skillPath);
  const entryPath = path.join(absolutePath, "SKILL.md");
  const checks = [];
  const metrics = [];
  const artifacts = [];

  if (!(await pathExists(entryPath))) {
    checks.push(createCheck({
      id: "skill-file-missing",
      category: "structure",
      severity: "error",
      status: "fail",
      message: "The skill directory is missing SKILL.md.",
      evidence: [entryPath],
      remediation: ["Add SKILL.md to the skill root."],
    }));
    const staticScore = computeStaticScore(checks);
    return buildEvaluationResult({ absolutePath, entryPath, name: path.basename(absolutePath), checks, metrics, artifacts, staticScore });
  }

  const content = await readText(entryPath);
  const parsed = parseFrontmatter(content);
  const frontmatter = parsed.data;
  const supportFiles = (await walkFiles(absolutePath)).filter((filePath) => filePath !== entryPath);
  const relativeLinks = findRelativeLinks(content);

  for (const error of parsed.errors) {
    checks.push(createCheck({
      id: "frontmatter-invalid",
      category: "structure",
      severity: "error",
      status: "fail",
      message: "The skill frontmatter is invalid or missing.",
      evidence: [error],
      remediation: ["Fix the YAML frontmatter at the top of SKILL.md."],
    }));
  }

  if (!frontmatter.name) {
    checks.push(createCheck({
      id: "name-missing",
      category: "structure",
      severity: "error",
      status: "fail",
      message: "The skill frontmatter is missing name.",
      evidence: [entryPath],
      remediation: ["Add a clear hyphen-case name field."],
    }));
  }

  if (!frontmatter.description) {
    checks.push(createCheck({
      id: "description-missing",
      category: "trigger",
      severity: "error",
      status: "fail",
      message: "The skill frontmatter is missing description.",
      evidence: [entryPath],
      remediation: ["Add a description that states when to use this skill."],
    }));
  } else if (!/use when|use this|when the user|用于|适用于|当/i.test(frontmatter.description)) {
    checks.push(createCheck({
      id: "description-trigger-weak",
      category: "trigger",
      severity: "warning",
      status: "warn",
      message: "The skill description does not clearly explain when to use it.",
      evidence: [frontmatter.description],
      remediation: ["Rewrite the description around concrete trigger conditions."],
    }));
  }

  if (!hasBoundaryLanguage(content)) {
    checks.push(createCheck({
      id: "boundary-unclear",
      category: "boundary",
      severity: "warning",
      status: "warn",
      message: "The skill does not clearly describe its boundaries.",
      evidence: ["No obvious scope, refusal, or non-goal language found."],
      remediation: ["Add what the skill should narrow, refuse, or hand off."],
    }));
  }

  if (!hasWorkflowLanguage(content)) {
    checks.push(createCheck({
      id: "workflow-unclear",
      category: "workflow",
      severity: "warning",
      status: "warn",
      message: "The skill lacks an executable workflow.",
      evidence: ["No obvious step/process/run language found."],
      remediation: ["Add concrete steps for the agent to follow."],
    }));
  }

  if (!hasVerificationLanguage(content)) {
    checks.push(createCheck({
      id: "verification-unclear",
      category: "verification",
      severity: "warning",
      status: "warn",
      message: "The skill does not explain how success should be verified.",
      evidence: ["No obvious verification or success criteria found."],
      remediation: ["Add expected output, acceptance criteria, or test commands."],
    }));
  }

  if (supportFiles.length === 0) {
    checks.push(createCheck({
      id: "support-files-missing",
      category: "support",
      severity: "warning",
      status: "warn",
      message: "The skill has no supporting files.",
      evidence: ["No references, scripts, templates, or examples found."],
      remediation: ["Add references, scripts, templates, or examples when useful."],
    }));
  }

  const brokenLinks = [];
  for (const link of relativeLinks) {
    if (!(await pathExists(path.resolve(absolutePath, link)))) {
      brokenLinks.push(link);
    }
  }
  if (brokenLinks.length > 0) {
    checks.push(createCheck({
      id: "broken-relative-links",
      category: "links",
      severity: "error",
      status: "fail",
      message: "The skill contains broken relative links.",
      evidence: brokenLinks,
      remediation: ["Fix or remove broken relative links."],
    }));
  }

  metrics.push(
    createMetric({ id: "skill_line_count", category: "structure", value: content.split(/\r?\n/).length, unit: "lines", band: "info" }),
    createMetric({ id: "support_file_count", category: "support", value: supportFiles.length, unit: "files", band: supportFiles.length > 0 ? "good" : "warning" }),
    createMetric({ id: "relative_link_count", category: "links", value: relativeLinks.length, unit: "links", band: brokenLinks.length ? "warning" : "good" }),
  );

  artifacts.push({
    id: "link-inventory",
    type: "inventory",
    data: { relativeLinks, brokenLinks },
  });

  const staticScore = computeStaticScore(checks);
  return buildEvaluationResult({
    absolutePath,
    entryPath,
    name: frontmatter.name || path.basename(absolutePath),
    checks,
    metrics,
    artifacts,
    staticScore,
  });
}

function buildEvaluationResult({ absolutePath, entryPath, name, checks, metrics, artifacts, staticScore }) {
  const riskLevel = riskForChecks(checks);
  return {
    schemaVersion: 1,
    kind: "skill-evaluation-result",
    createdAt: new Date().toISOString(),
    target: {
      type: "skill",
      name,
      path: absolutePath,
      entryPath,
    },
    summary: {
      overallScore: staticScore,
      staticScore,
      benchmarkScore: null,
      grade: gradeForScore(staticScore),
      riskLevel,
      recommendation: recommendationForScore(staticScore, riskLevel),
      topIssues: checks.filter((check) => check.status !== "pass").slice(0, 5),
    },
    checks,
    metrics,
    artifacts,
  };
}
