# Runner Interface

Runners execute benchmark scenarios through CLI commands and return a shared result shape.

```ts
interface RunnerAdapter {
  name: "claude-code" | "aily";
  runScenario(input: ScenarioInput): Promise<ScenarioRunResult>;
}
```

CLI entrypoint:

```bash
skill-eval run-benchmark --runner claude-code --config ./benchmark.json
skill-eval run-benchmark --runner aily --config ./benchmark.json
```

The benchmark config may provide `runner.command`. The command receives:

- `SKILL_EVAL_RUNNER`
- `SKILL_EVAL_SCENARIO_ID`
- `SKILL_EVAL_USER_INPUT`
- `SKILL_EVAL_WORKSPACE`
- `SKILL_EVAL_RUN_PATH`
- `SKILL_EVAL_SKILL_PATH`
