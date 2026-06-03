---
name: skill-eval
description: Use when evaluating an agent skill, initializing or running a skill benchmark, comparing skill versions, or generating a review packet. Do not use for plugin evaluation or token budget analysis.
---

# Skill Eval

Use the shared Skill Eval Framework CLI.

## Commands

- `/skill-eval:analyze` -> `skill-eval analyze <skill-path>`
- `/skill-eval:init-benchmark` -> `skill-eval init-benchmark <skill-path>`
- `/skill-eval:run-benchmark` -> `skill-eval run-benchmark --runner claude-code --config <benchmark.json>`
- `/skill-eval:compare` -> `skill-eval compare <before.json> <after.json>`
- `/skill-eval:improve` -> `skill-eval improve <result.json>`
- `/skill-eval:review-packet` -> `skill-eval review-packet <evaluation.json> <benchmark-run.json>`

## Boundaries

- Only evaluate skills.
- Do not evaluate plugins.
- Do not add token budget scoring.
- Use runner adapters instead of platform-specific scoring.

## References

- `references/benchmark-schema.md`
- `references/scoring-rubric.md`
