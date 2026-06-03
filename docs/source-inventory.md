# Source Inventory

Source reference: https://github.com/openai/plugins/tree/main/plugins/plugin-eval

This repository migrates concepts from the public `plugin-eval` codebase but changes the product scope:

- skill-only evaluation
- no plugin evaluation
- no Codex plugin manifest checks
- no token budget scoring
- no `codex exec` coupling

Reusable source concepts:

- skill frontmatter and structure checks
- benchmark starter scenarios
- compare reports
- improvement briefs
- JSON / Markdown report rendering

Deleted source concepts:

- `.codex-plugin/`
- plugin evaluator
- `evaluate-plugin`
- token budget scoring
- Codex-specific runner logic
