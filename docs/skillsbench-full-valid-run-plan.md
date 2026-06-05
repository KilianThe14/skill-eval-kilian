# SkillsBench Full Valid Run Plan

## Goal

Run a full valid-set SkillsBench A/B experiment from the local Codex machine to compare:

- `no_skill`: Claude Code ACP agent without task-level skill nudge.
- `original_skill`: Claude Code ACP agent with original task-level skills surfaced through `BENCHFLOW_SKILL_NUDGE=description`.

This run is not for `skill-eval-kilian` improvement yet. It only establishes whether original SkillsBench task-level skills improve Claude Code performance when the skills are actually surfaced.

## Why This Plan Changed

The previous remote-machine run was blocked by company gateway limits, sandbox networking issues, and missing environment propagation. The local Codex machine will run the benchmark directly so we can inspect logs, preserve artifacts, and adapt around infra failures without losing state.

Lessons from earlier runs:

- A plain `original_skill` group is not enough. The agent often does not discover task-level skills unless `BENCHFLOW_SKILL_NUDGE=description` is set.
- `bike-rebalance` is excluded because `claude-agent-acp` hit a sandbox Bash permission issue: `EACCES: permission denied, mkdir '/home/agent/.claude/session-env'`.
- `edit-pdf` is excluded for qwen/gateway compatibility because PDF/PNG content blocks caused `API Error: 400 Unexpected item type in content`.
- Verifier network failures, such as `uv` download failures, must be labeled `infra_failure`, not counted as agent failures.
- Runs must preserve full `jobs/` directories for later diagnosis.

## Experiment Design

| Group | Skills state | Skill nudge | Purpose |
| --- | --- | --- | --- |
| `no_skill` | Clear repo-level `.agents/skills` in the worktree | unset | Baseline with no explicit task skill guidance |
| `original_skill` | Keep original SkillsBench task-level skills | `BENCHFLOW_SKILL_NUDGE=description` | Measure original skill value when descriptions are injected |

Both groups must use:

- Same SkillsBench commit.
- Same task set.
- Same model.
- Same gateway environment.
- Same sandbox backend.
- Same concurrency.

## Task Set

Use all task directories under `tasks/`, excluding known invalid-for-this-run tasks:

- Exclude `bike-rebalance`.
- Exclude `edit-pdf`.

All other tasks are included in the main full valid set. Any later infra-only failures are excluded during summary, not before execution.

## Required Environment

Required tools:

- `git`
- `uv`
- `docker` or OrbStack-compatible Docker CLI
- `claude`

Required environment variables:

```bash
export ANTHROPIC_BASE_URL="<company gateway endpoint>"
export ANTHROPIC_AUTH_TOKEN="<api key>"
export ANTHROPIC_API_KEY="$ANTHROPIC_AUTH_TOKEN"
export MODEL="qwen3.7-max"
```

The benchmark commands must pass gateway variables into the agent sandbox with `--agent-env`.

## Working Directories

Use a dedicated benchmark workspace outside the repo:

```text
/Users/celinedon/skillsbench-full-valid-run/
  skillsbench/                  # source clone
  skillsbench-no-skill/         # A-group worktree
  skillsbench-original-skill/   # B-group worktree
  results/
    manifest.json
    no_skill/jobs/
    no_skill/run.log
    original_skill/jobs/
    original_skill/run.log
    summary_full.json
    summary_full.csv
    summary_full.jsonl
    report_full.md
```

## Execution Steps

### 1. Preflight

Verify the local machine can use the model and Docker:

```bash
docker version
docker info
claude -p "只回复 pong" --model "$MODEL" --output-format text
```

### 2. Clone And Prepare SkillsBench

```bash
BASE="/Users/celinedon/skillsbench-full-valid-run"
REPO="$BASE/skillsbench"
RESULTS="$BASE/results"

mkdir -p "$BASE" "$RESULTS"
cd "$BASE"

if [ ! -d "$REPO/.git" ]; then
  git clone https://github.com/benchflow-ai/skillsbench.git "$REPO"
fi

cd "$REPO"
git pull --ff-only || true
uv sync --locked
```

### 3. Build Full Valid Task Set

```bash
mkdir -p experiments/kilian-full-valid

find tasks -maxdepth 1 -mindepth 1 -type d -exec basename {} \; \
  | sort \
  | grep -v '^bike-rebalance$' \
  | grep -v '^edit-pdf$' \
  > experiments/kilian-full-valid/task_subset.txt

rm -rf experiments/kilian-full-valid/tasks_eval
mkdir -p experiments/kilian-full-valid/tasks_eval

while read -r task; do
  cp -R "tasks/$task" "experiments/kilian-full-valid/tasks_eval/$task"
done < experiments/kilian-full-valid/task_subset.txt

while read -r task; do
  uv run bench tasks check "experiments/kilian-full-valid/tasks_eval/$task"
done < experiments/kilian-full-valid/task_subset.txt
```

### 4. Create A/B Worktrees

```bash
cd "$BASE"

rm -rf "$BASE/skillsbench-no-skill" "$BASE/skillsbench-original-skill"
git -C "$REPO" worktree remove "$BASE/skillsbench-no-skill" --force 2>/dev/null || true
git -C "$REPO" worktree remove "$BASE/skillsbench-original-skill" --force 2>/dev/null || true

git -C "$REPO" worktree add "$BASE/skillsbench-no-skill" HEAD
git -C "$REPO" worktree add "$BASE/skillsbench-original-skill" HEAD

cd "$BASE/skillsbench-no-skill"
rm -rf .agents/skills
mkdir -p .agents/skills
rm -rf experiments/kilian-full-valid
cp -R "$REPO/experiments/kilian-full-valid" experiments/kilian-full-valid
uv sync --locked

cd "$BASE/skillsbench-original-skill"
rm -rf experiments/kilian-full-valid
cp -R "$REPO/experiments/kilian-full-valid" experiments/kilian-full-valid
uv sync --locked
```

### 5. Write Manifest

```bash
TASK_COUNT="$(wc -l < "$REPO/experiments/kilian-full-valid/task_subset.txt" | tr -d ' ')"

cat > "$RESULTS/manifest.json" <<EOF
{
  "experiment": "skillsbench_full_valid_set_no_skill_vs_original_skill",
  "repo": "https://github.com/benchflow-ai/skillsbench",
  "agent": "claude-agent-acp",
  "model": "$MODEL",
  "sandbox": "docker",
  "concurrency": 1,
  "excluded_tasks": {
    "bike-rebalance": "Bash permission bug: EACCES mkdir /home/agent/.claude/session-env",
    "edit-pdf": "qwen3.7-max/gateway content block API 400 on PDF/PNG"
  },
  "groups": {
    "no_skill": {
      "skills": "cleared",
      "BENCHFLOW_SKILL_NUDGE": null
    },
    "original_skill": {
      "skills": "original task-level skills",
      "BENCHFLOW_SKILL_NUDGE": "description"
    }
  },
  "task_subset_file": "experiments/kilian-full-valid/task_subset.txt",
  "task_count": "$TASK_COUNT",
  "results_dir": "$RESULTS"
}
EOF
```

### 6. Run Group A

```bash
cd "$BASE/skillsbench-no-skill"

uv run bench eval create \
  --tasks-dir experiments/kilian-full-valid/tasks_eval \
  --agent claude-agent-acp \
  --model "$MODEL" \
  --sandbox docker \
  --agent-env "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL" \
  --agent-env "ANTHROPIC_AUTH_TOKEN=$ANTHROPIC_AUTH_TOKEN" \
  --agent-env "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
  --concurrency 1 \
  --jobs-dir "$RESULTS/no_skill/jobs" \
  2>&1 | tee "$RESULTS/no_skill/run.log"
```

### 7. Run Group B

```bash
cd "$BASE/skillsbench-original-skill"

uv run bench eval create \
  --tasks-dir experiments/kilian-full-valid/tasks_eval \
  --agent claude-agent-acp \
  --model "$MODEL" \
  --sandbox docker \
  --agent-env "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL" \
  --agent-env "ANTHROPIC_AUTH_TOKEN=$ANTHROPIC_AUTH_TOKEN" \
  --agent-env "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
  --agent-env "BENCHFLOW_SKILL_NUDGE=description" \
  --concurrency 1 \
  --jobs-dir "$RESULTS/original_skill/jobs" \
  2>&1 | tee "$RESULTS/original_skill/run.log"
```

### 8. Summarize

Create a summary script that:

- Reads all `result.json` files.
- Labels Docker/network/gateway/verifier-only failures as `infra_failure`.
- Computes valid-run success rate and average reward after excluding infra failures.
- Records skill mentions in logs.
- Writes:
  - `summary_full.json`
  - `summary_full.csv`
  - `summary_full.jsonl`
  - `report_full.md`

## Failure Policy

Classify as `infra_failure` when logs include:

- Docker registry failures.
- `uv` download failures.
- `uvx: command not found`.
- verifier setup failure before tests run.
- `API Error: 400 Unexpected item type in content`.
- `EACCES mkdir /home/agent/.claude/session-env`.
- authentication/gateway failures unrelated to task reasoning.

Do not delete `jobs/`. If a run stops halfway, preserve completed jobs and continue with a remaining-task subset.

## Success Criteria

The run is usable if:

- Both groups run the same valid task set.
- `original_skill` has `BENCHFLOW_SKILL_NUDGE=description` in its agent environment.
- Results are saved under `$RESULTS`.
- Infra failures are separated from agent/task failures.
- At least one report compares `valid_runs`, `success`, `avg_reward_valid`, `infra_failure`, and `timeout`.

## Immediate Next Step

Before starting the full run, perform local preflight:

```bash
docker version
docker info
uv --version
claude -p "只回复 pong" --model "$MODEL" --output-format text
```

If preflight passes, start the full run with `concurrency=1`.
