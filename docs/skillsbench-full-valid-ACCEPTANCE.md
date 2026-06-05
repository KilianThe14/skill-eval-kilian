# SkillsBench Full Valid Run Acceptance

## 验收标准

| 维度 | 应该写什么 | 验收标准 |
| --- | --- | --- |
| 实验配置 | 明确 A/B 两组、任务集、agent、sandbox、并发和排除任务 | `results/manifest.json` 存在，且包含 `no_skill`、`original_skill`、`task_count`、`excluded_tasks`、`sandbox=docker` |
| 模型配置 | 必须显式使用 Codex 模型，避免 BenchFlow fallback 到 Claude 默认模型 | `manifest.json` 记录 `model=gpt-5.5`；两组 run command 都包含 `--model gpt-5.5` |
| 任务集一致性 | 两组必须跑同一批任务 | `no_skill/jobs` 和 `original_skill/jobs` 的 task 集合一致；若有中断，必须有 remaining-task 说明 |
| no_skill 条件 | A 组不能加载原始 skills，也不能注入 skill nudge | A 组 worktree 的 `.agents/skills` 为空；A 组 run log 不包含 `BENCHFLOW_SKILL_NUDGE=description` |
| original_skill 条件 | B 组必须保留原始 task-level skills，并显式注入 skill 描述 | B 组 `.agents/skills` 存在；B 组 run log 或 result artifacts 能证明设置了 `BENCHFLOW_SKILL_NUDGE=description` |
| Codex 本机认证 | 使用本机 Codex auth，不依赖公司网关变量 | `~/.codex/auth.json` 存在，或 manifest 明确记录替代认证方式；日志和文档不包含明文 token |
| Sandbox 兼容补丁 | 确保 BenchFlow 能把 skill 上传到任务容器 | copied `tasks_eval/*/environment/Dockerfile` 包含创建 `/app /app/skills` 的兼容补丁；smoke task 不再出现 `Could not find the file /app` |
| 结果产物 | 每组完整保留 BenchFlow job artifacts | `results/no_skill/jobs` 和 `results/original_skill/jobs` 存在，且包含 `result.json` 文件 |
| 汇总产物 | 输出可审计的结构化和可读报告 | `summary_full.json`、`summary_full.csv`、`summary_full.jsonl`、`report_full.md` 均存在 |
| 失败归因 | infra failure 不能混入 agent/task failure | 汇总中每条结果有 `status`；Docker、下载、runtime、认证、verifier setup 等问题标记为 `infra_failure` |
| 对比结论 | 从用户结果和系统行为出发说明哪组更好 | `report_full.md` 包含两组 `valid_runs`、`success`、`avg_reward_valid`、`infra_failure`、`timeout` 对比 |

## 验收评判

| 验收标准 | 验证方式 | 证据 |
| --- | --- | --- |
| manifest 完整 | 自动检查 JSON 字段 | `results/manifest.json` |
| 模型配置正确 | 日志检查 | `results/no_skill/run.log`、`results/original_skill/run.log` 中没有 `ANTHROPIC_API_KEY required for model 'claude` |
| 两组任务一致 | 脚本比较两组 `result.json` 对应 task 名称 | `summary_full.json` 或补充检查日志 |
| A 组无 skill nudge | 手动/脚本检查 run log 和 worktree | `results/no_skill/run.log`、`skillsbench-no-skill/.agents/skills` |
| B 组有 skill nudge | 手动/脚本检查 run log、prompt、result artifacts | `results/original_skill/run.log`、jobs 内 prompt/log 文件 |
| Codex 本机认证 | 文件检查 + 日志检查 | `~/.codex/auth.json` 存在；`manifest.json` 的 `auth_mode`；确认无明文密钥 |
| Sandbox 兼容补丁 | Dockerfile 检查 + smoke run 日志 | copied `tasks_eval` Dockerfile；smoke result `reward=1.0` 或至少进入 agent execution |
| jobs 保留 | 文件系统检查 | `results/no_skill/jobs/**/result.json`、`results/original_skill/jobs/**/result.json` |
| 汇总报告生成 | 文件系统检查 + 打开报告抽查 | `summary_full.*`、`report_full.md` |
| infra failure 分离 | 人工抽查 3-5 个失败样本，对照日志 | `summary_full.csv`、对应 job 日志 |
| 结论可验证 | 报告中的统计数字能从 `summary_full.jsonl` 复算 | `report_full.md`、`summary_full.jsonl` |

未覆盖项必须明确标记为 `not_verified`，不能写成已完成。

## 完成检查

- [ ] Docker/Colima 运行正常。
- [ ] Codex CLI 可用，且 `~/.codex/auth.json` 存在或替代认证方式已写入 manifest。
- [ ] Codex smoke test 通过，manifest 记录 `model=gpt-5.5`。
- [ ] SkillsBench repo、A/B worktree、任务集已创建。
- [ ] 任务合法性检查完成，失败任务已记录。
- [ ] copied `tasks_eval` Dockerfile 已补齐 `/app /app/skills`，并通过单任务 smoke 验证。
- [ ] A 组和 B 组都完成运行，或已记录中断点和 remaining-task 计划。
- [ ] `jobs/` 目录未删除。
- [ ] 汇总脚本已运行。
- [ ] `summary_full.json`、`summary_full.csv`、`summary_full.jsonl`、`report_full.md` 已生成。
- [ ] 抽查至少 3 个成功样本和 3 个失败样本的日志。
- [ ] 文档和脚本没有残留 debug-only 输出、硬编码 token、个人密钥。
- [ ] 最终回复列出完成项、未覆盖项和下一步。

## 遗留问题

- 如果 Codex ACP 在 BenchFlow 中无法直接使用，需要记录具体 agent/runtime 错误，并把状态标为 blocked，不能把实验结论归因给 skill。
- 如果全量运行中断，需要保留已完成 jobs，并生成 remaining-task 文件后续跑。
- 如果某些任务由于 sandbox、Docker registry、verifier 下载或模型 runtime 问题失败，需要标记 `infra_failure` 并从主指标剔除。
- 如果 `original_skill` 没有任何 skill mention 或 prompt nudge 证据，本轮不能作为 skill 有效性实验，只能作为 runner smoke test。
