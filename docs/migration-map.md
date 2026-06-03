# Migration Map

| Original Plugin Eval Area | Skill Eval Framework Handling |
| --- | --- |
| `src/evaluators/skill.js` | Migrated and changed for skill-only scoring. |
| `src/core/benchmark.js` | Migrated conceptually; runner execution is abstracted. |
| `src/core/scoring.js` | Rewritten without token budget. |
| `src/core/compare.js` | Migrated conceptually. |
| `src/core/improvement-brief.js` | Migrated conceptually. |
| `src/renderers/` | Reimplemented for JSON/Markdown output. |
| `src/evaluators/plugin.js` | Removed. |
| `.codex-plugin/` | Removed. |
| `skills/evaluate-plugin` | Removed. |
| budget logic | Removed permanently. |
| `codex exec` runner | Replaced by CLI runner adapters. |
