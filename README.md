# Skill Eval Framework

`skill-eval-kilian` is a skill-only evaluation and benchmark framework.

It is migrated from ideas in OpenAI's public `plugins/plugin-eval` project, but it intentionally removes:

- plugin evaluation
- Codex plugin manifest checks
- token budget scoring
- `codex exec` coupling

The framework keeps one core evaluation engine and exposes two first-version runners:

- Claude Code runner
- Aily runner

Both runners are triggered through CLI commands and return the same result schema.

## Quick Start

```bash
npm test
node packages/cli/src/cli.js analyze examples/skills/sample-skill --format markdown
node packages/cli/src/cli.js init-benchmark examples/skills/sample-skill --output /tmp/benchmark.json
```

## CLI

```bash
skill-eval analyze <skill-path>
skill-eval init-benchmark <skill-path>
skill-eval run-benchmark --runner claude-code --config <benchmark.json>
skill-eval run-benchmark --runner aily --config <benchmark.json>
skill-eval report <result.json>
skill-eval compare <before.json> <after.json>
skill-eval improve <result.json>
skill-eval review-packet <result.json> <benchmark-run.json>
```

## Repository Status

This repository is designed to be public. See `docs/source-inventory.md` and `docs/migration-map.md` for the migration boundary from `openai/plugins/plugins/plugin-eval`.
