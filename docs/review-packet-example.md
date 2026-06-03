# Review Packet Example

Generate locally:

```bash
node packages/cli/src/cli.js analyze examples/skills/sample-skill --output /tmp/sample-evaluation.json
node packages/cli/src/cli.js init-benchmark examples/skills/sample-skill --runner claude-code --workspace examples/workspace --command "node /Users/celinedon/skill-eval-kilian/examples/fake-agent-runner.js" --output /tmp/sample-benchmark.json
node packages/cli/src/cli.js run-benchmark --runner claude-code --config /tmp/sample-benchmark.json --output /tmp/sample-benchmark-run.json
node packages/cli/src/cli.js review-packet /tmp/sample-evaluation.json /tmp/sample-benchmark-run.json
```

Expected evidence:

- static evaluation JSON
- benchmark run JSON
- review packet Markdown
- scenario run artifacts under `.skill-eval/runs/`
