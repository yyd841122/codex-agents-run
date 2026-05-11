# Vibe Agent MVP

一个最小可运行的多 Agent 自动化 Vibe Coding 框架。

目标流程：

```text
用户需求
-> Orchestrator 拆解任务
-> 生成子 Agent 提示词
-> Runner 顺序执行任务
-> 自动测试 / 审查 / 最多返工一次
-> 生成执行报告
```

当前版本默认使用离线模拟 Agent，方便先验证流程。也可以通过 DeepSeek API 启用真实模型调用。

## 快速开始

```bash
npm run vibe -- run "create a snake game web app" --yes
```

执行后会生成：

```text
.vibe/
  runs/<run-id>/
    plan.json
    git-before.json
    git-after.json
    prompts/
    tasks/
    report.md
generated/
  snake-game/
```

## CLI

```bash
node src/cli.js run "create a snake game web app" --yes
node src/cli.js run "create a snake game web app" --dry-run
node src/cli.js inspect .vibe/runs/<run-id>
```

## 使用 DeepSeek

DeepSeek API Key 填在环境变量 `DEEPSEEK_API_KEY`。

PowerShell 示例：

```powershell
$env:DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
node src/cli.js run "create a snake game web app" --llm deepseek --yes
```

也可以创建 `.env` 文件，当前 MVP 会自动读取项目根目录下的 `.env`：

```text
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-v4-flash
VIBE_LLM=deepseek
```

`.env` 已加入 `.gitignore`，不要提交真实 API Key。

DeepSeek 官方 OpenAI-compatible 配置：

```text
base_url: https://api.deepseek.com
api_key: DEEPSEEK_API_KEY
default model: deepseek-v4-flash
```

## MVP Agent

- `orchestrator`: 主控协调，只负责任务推进与汇总
- `planner`: 需求拆解、项目结构规划
- `coder`: 写入代码
- `tester`: 运行测试命令并总结错误
- `reviewer`: 审查产物与验收条件
- `fixer`: 根据测试或审查结果返工一次
- `reporter`: 生成交付报告

## 安全边界

第一版安全策略：

- 所有写入限制在当前工作区内
- 任务声明可写范围
- Shell 命令默认走允许列表
- 每个 run 都记录 plan、prompt、task log、report
- 每个 run 都记录 Git 前后状态和 diff 统计
- 默认不执行危险命令

## 下一步

建议下一阶段接入真实 LLM Agent：

1. 强化模型输出 JSON 修复与重试。
2. 增加 Git 快照。
3. 增加真实测试失败后的多轮返工闭环。
4. 增加任务并行与冲突合并策略。
