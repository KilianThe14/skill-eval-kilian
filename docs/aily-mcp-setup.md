# Aily 自定义 MCP 接入说明

Aily 自定义 MCP 工具页面填写：

| 字段 | 建议值 |
| --- | --- |
| 名称 | `Skill Eval Kilian` |
| 描述 | `评估 agent skill、生成 skill benchmark、运行 benchmark、比较版本并生成 review packet。不评估 plugin，不包含 token budget。` |
| 请求地址 | `https://<your-domain>/sse` |
| 传输方式 | `SSE` |

本地启动：

```bash
npm install
SKILL_EVAL_ALLOWED_ROOTS=/path/to/workspaces npm run mcp:sse
```

如果允许 Aily 触发真实 benchmark 执行：

```bash
SKILL_EVAL_MCP_ENABLE_RUNNER=true \
SKILL_EVAL_ALLOWED_ROOTS=/path/to/workspaces \
npm run mcp:sse
```

默认安全设置：

- `run_skill_benchmark` 默认禁用真实执行。
- 只有设置 `SKILL_EVAL_MCP_ENABLE_RUNNER=true` 才能执行 runner command。
- 所有文件路径必须位于 `SKILL_EVAL_ALLOWED_ROOTS` 内。
- `outputPath` 只适合写 MCP server 所在机器的本地路径；Aily 沙箱路径不会让工具失败，但会返回 `OUTPUT_PATH_STATUS.written=false`。
- 返回内容会压缩，避免超过 Aily 上下文。
- 服务会读取 Aily header：`x-aily-user`、`x-aily-email`，用于审计和后续鉴权。

## Aily 路径限制

Aily 附件和工作区路径类似 `/home/gem/.aily/...`，这些路径在 Aily 沙箱内，不在 MCP server 所在机器上。MCP server 如果部署在本机或云服务器，不能直接读取这些路径。

在 Aily 中调用时优先传内联内容：

| Tool | Aily 推荐参数 |
| --- | --- |
| `analyze_skill` | `skillMarkdown` + `skillName` |
| `init_skill_benchmark` | `skillMarkdown` + `skillName` |
| `run_skill_benchmark` | `benchmarkConfig` |
| `score_benchmark_result` | `benchmarkRun` |
| `compare_skill_versions` | `beforeEvaluation` + `afterEvaluation` |
| `suggest_skill_improvements` | `evaluationResult` |
| `generate_review_packet` | `evaluationResult` + optional `benchmarkRun` |

只在 MCP server 能访问同一块文件系统时使用 `skillPath`、`configPath`、`evaluationResultPath` 这类路径参数。

MCP 返回格式：

- `content.text` 会包含摘要、可选的 `OUTPUT_PATH_STATUS`、以及 `JSON_RESULT`。
- Aily 后续调用应直接读取 `JSON_RESULT`，再作为 `benchmarkConfig`、`evaluationResult` 或 `benchmarkRun` 传给下一步。
- 不要依赖 Aily 读取 `outputPath` 写出的文件，除非 MCP server 和 Aily 共享同一文件系统。

## 暴露的 MCP tools

| Tool | 作用 |
| --- | --- |
| `analyze_skill` | 静态评估 skill |
| `init_skill_benchmark` | 生成三类 starter benchmark |
| `run_skill_benchmark` | 运行 benchmark，默认需要显式开启 |
| `score_benchmark_result` | 读取 benchmark run summary |
| `compare_skill_versions` | 比较两个 evaluation result |
| `suggest_skill_improvements` | 生成 skill 改进 brief |
| `generate_review_packet` | 生成 PM 可读 review packet |

## Aily 出口 IP 白名单

按 Aily 文档，可以只允许以下 IP 访问 MCP endpoint：

```text
101.126.59.88
101.126.59.89
101.126.59.90
101.126.59.91
101.126.59.92
122.14.241.34
122.14.241.35
122.14.241.36
122.14.241.37
122.14.241.38
```

## 部署建议

需要把本地服务部署到 Aily 可访问的 HTTPS 域名，例如：

```text
https://skill-eval-kilian.example.com/sse
```

如果临时测试，可以用内网穿透或云服务器反向代理，但不要把 endpoint 放到非 Aily Agent 中使用。
