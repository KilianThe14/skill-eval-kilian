# SkillsBench Full Valid Run Plan

## Goal

Run a full valid-set SkillsBench A/B experiment from the local Codex machine to compare:

- `no_skill`: Codex agent without task-level skill nudge.
- `original_skill`: Codex agent with original task-level skills surfaced through `BENCHFLOW_SKILL_NUDGE=description`.

This run is not for `skill-eval-kilian` improvement yet. It only establishes whether original SkillsBench task-level skills improve Codex performance when the skills are actually surfaced.

## Why This Plan Changed

The previous remote-machine run was blocked by company gateway limits, sandbox networking issues, and missing environment propagation. The local Codex machine will run the benchmark directly with the already-available Codex runtime, so no company gateway variables are required. Running locally also lets us inspect logs, preserve artifacts, and adapt around infra failures without losing state.

Lessons from earlier runs:

- A plain `original_skill` group is not enough. The agent often does not discover task-level skills unless `BENCHFLOW_SKILL_NUDGE=description` is set.
- The previous `bike-rebalance` failure was specific to Claude Code ACP sandbox state. Do not pre-exclude it in the Codex run; classify any recurrence from logs.
- The previous `edit-pdf` failure was specific to qwen/gateway content-block compatibility. Do not pre-exclude it in the Codex run; classify any recurrence from logs.
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
- Same local Codex runtime.
- Same sandbox backend.
- Same concurrency.

## Task Set

Use all task directories under `tasks/`. Do not pre-exclude tasks based on the earlier qwen/Claude Code run. Any later infra-only failures are excluded during summary, not before execution.

## Required Environment

Required tools:

- `git`
- `uv`
- `docker` or OrbStack-compatible Docker CLI
- `codex`

No company gateway environment variables are required for this local run. Do not set `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, or `ANTHROPIC_API_KEY` for the benchmark unless the Codex runner explicitly requires them in a later compatibility check.

Codex auth requirement:

- Prefer the local subscription/auth file: `~/.codex/auth.json`.
- If the local Codex ACP runner cannot use that file, set the minimal Codex/OpenAI-compatible environment required by `codex-acp` and record it in `manifest.json`.
- Do not write API keys into scripts, logs, markdown, or git-tracked files.

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

Verify the local machine can use Codex and Docker:

```bash
docker version
docker info
uv --version
codex --version
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
  "agent": "codex-acp",
  "model": "local-codex-runtime",
  "sandbox": "docker",
  "concurrency": 1,
  "excluded_tasks": {},
  "auth_mode": "local ~/.codex/auth.json unless codex-acp requires explicit env",
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
  --agent codex-acp \
  --sandbox docker \
  --concurrency 1 \
  --jobs-dir "$RESULTS/no_skill/jobs" \
  2>&1 | tee "$RESULTS/no_skill/run.log"
```

### 7. Run Group B

```bash
cd "$BASE/skillsbench-original-skill"

uv run bench eval create \
  --tasks-dir experiments/kilian-full-valid/tasks_eval \
  --agent codex-acp \
  --sandbox docker \
  --agent-env "BENCHFLOW_SKILL_NUDGE=description" \
  --concurrency 1 \
  --jobs-dir "$RESULTS/original_skill/jobs" \
  2>&1 | tee "$RESULTS/original_skill/run.log"
```

### 8. Summarize

Create a summary script that:

- Reads all `result.json` files.
- Labels Docker/network/runtime/verifier-only failures as `infra_failure`.
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
- authentication/runtime failures unrelated to task reasoning.

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
codex --version
```

If preflight passes, start the full run with `concurrency=1`.
