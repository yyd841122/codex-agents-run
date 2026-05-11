# Vibe Agent MVP

A minimal multi-agent vibe coding orchestrator.

Target workflow:

```text
User requirement
-> Orchestrator creates a plan
-> Child Agent prompts are generated
-> Runner executes tasks in order
-> Tests, review, and fix loops run automatically
-> A final report is generated for user acceptance
```

The MVP runs offline by default for local workflow validation. It can also call DeepSeek through its OpenAI-compatible API.

## Configuration

Runtime defaults live in `vibe.config.json`:

```json
{
  "llm": {
    "provider": "offline",
    "model": "deepseek-v4-flash",
    "deepseekTimeoutMs": 90000
  },
  "workflow": {
    "fixMaxAttempts": 3,
    "qualityFixWarnings": false
  },
  "agents": {
    "templatesDir": "templates/agents"
  },
  "git": {
    "checkpoint": false,
    "push": false
  },
  "batch": {
    "continueOnFailure": false
  },
  "queue": {
    "inboxDir": ".vibe/inbox",
    "processedDir": ".vibe/processed",
    "failedDir": ".vibe/failed"
  }
}
```

Precedence is: CLI flags, environment variables, `vibe.config.json`, then built-in defaults.

## Quick Start

```bash
npm run vibe -- run "create a snake game web app" --yes
```

Generated run records:

```text
.vibe/
  runs/<run-id>/
    plan.json
    git-before.json
    git-after.json
    prompts/
    tasks/
    report.md
```

Generated project files are written under:

```text
generated/
  snake-game/
```

Before a new code task writes files, the runner clears the target `generated/<project>` directory. This prevents stale files from previous runs from polluting review results.

## CLI

```bash
node src/cli.js run "create a snake game web app" --yes
node src/cli.js plan --from-file examples/requirements/erp.zh.txt
node src/cli.js expand-plan .vibe/project-plans/<project-plan-id>/project-plan.json
node src/cli.js run --from-file examples/requirements/mobile-snake.zh.txt --llm deepseek --yes
node src/cli.js run "create a snake game web app" --dry-run
node src/cli.js run "create a snake game web app" --llm deepseek --yes
node src/cli.js run "create a snake game web app" --llm deepseek --yes --deepseek-timeout-ms 120000
node src/cli.js run "create a snake game web app" --llm deepseek --yes --git-checkpoint
node src/cli.js run "create a snake game web app" --llm deepseek --yes --git-checkpoint --git-push
node src/cli.js run "create a snake game web app" --llm deepseek --yes --quality-fix
node src/cli.js batch examples/tasks.sample.json --yes
node src/cli.js batch examples/tasks.sample.json --yes --continue-on-failure
node src/cli.js queue --yes
node src/cli.js queue --yes --queue-inbox-dir examples/inbox
node src/cli.js doctor
node src/cli.js inspect latest
node src/cli.js inspect list
node src/cli.js inspect .vibe/runs/<run-id>
```

For large systems such as ERP, start with project planning instead of direct code generation:

```bash
node src/cli.js plan --from-file examples/requirements/erp.zh.txt
```

Project plans are written to `.vibe/project-plans/<project-plan-id>/` and include modules, phases, Agent responsibilities, draft data model, draft API contracts, delivery batches, acceptance criteria, and risks.

After reviewing a project plan, expand it into executable module tasks:

```bash
node src/cli.js expand-plan .vibe/project-plans/<project-plan-id>/project-plan.json
```

Expanded project tasks are written to `.vibe/project-tasks/<project-tasks-id>/`. The generated `batch.json` can be passed directly to batch mode:

```bash
node src/cli.js batch .vibe/project-tasks/<project-tasks-id>/batch.json --yes --dry-run
node src/cli.js batch .vibe/project-tasks/<project-tasks-id>/batch.json --llm deepseek --yes --continue-on-failure
```

Batch files can be a JSON array:

```json
[
  "create a snake game web app",
  "create a todo web app"
]
```

Or an object with a `tasks` array:

```json
{
  "tasks": [
    { "requirement": "create a snake game web app" },
    { "requirement": "create a todo web app" }
  ]
}
```

Batch run records are written to `.vibe/batches/<batch-id>/`.

Git checkpoints are optional. When `--git-checkpoint` is enabled, the runner writes a compact tracked record to `records/runs/<run-id>.json` and creates a Git commit for that record plus any generated files that are not ignored by Git. Add `--git-push` to push the checkpoint commit.

Quality fix is optional. Blocking review findings still trigger mandatory Fix Agent work. Warning findings do not block delivery, but `--quality-fix` or `workflow.qualityFixWarnings: true` runs one extra low-risk Fix Agent pass, then reruns tests and review.

Queue mode is the MVP external entry point. Drop `.txt` or `.json` requirement files into the inbox directory, then run:

```bash
node src/cli.js queue --yes
```

Text files use the whole file as the requirement. JSON files use:

```json
{
  "requirement": "create a snake game web app"
}
```

Completed queue files move to `.vibe/processed`; failed items move to `.vibe/failed`. Queue reports are written to `.vibe/queues/<queue-id>/`.

On Windows, prefer `--from-file` or `queue` for Chinese requirements so the CLI reads UTF-8 text directly instead of depending on terminal argument encoding.

Useful configurable CLI overrides:

```bash
node src/cli.js run "create a snake game web app" --fix-max-attempts 5
node src/cli.js run "create a snake game web app" --agent-templates-dir templates/agents
node src/cli.js queue --queue-inbox-dir examples/inbox --dry-run
```

## DeepSeek Setup

Set the DeepSeek API key with an environment variable:

```powershell
$env:DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
node src/cli.js run "create a snake game web app" --llm deepseek --yes
```

You can also create a `.env` file at the project root:

```text
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=90000
VIBE_LLM=deepseek
```

`.env` is ignored by Git. Do not commit real API keys.

DeepSeek configuration:

```text
base_url: https://api.deepseek.com
endpoint: /chat/completions
api_key: DEEPSEEK_API_KEY
default model: deepseek-v4-flash
default timeout: 90000ms
```

## MVP Agents

- `orchestrator`: Coordinates workflow only.
- `planner`: Converts requirements into tasks and acceptance criteria.
- `coder`: Implements files within the declared scope.
- `tester`: Runs verification commands and summarizes failures.
- `reviewer`: Reviews generated files against acceptance criteria.
- `fixer`: Applies focused fixes based on failed tests or blocking review findings.
- `reporter`: Produces the final delivery report.

Review Agent reads generated files and can return structured `findings`. Any finding with `severity: "blocking"` triggers the Fix Agent.

Agent behavior templates live in `templates/agents/*.md`. The runner loads the matching Markdown template for each task and embeds it into the generated prompt for that Agent. This means you can tune Agent behavior by editing files such as:

```text
templates/agents/coder.md
templates/agents/reviewer.md
templates/agents/fixer.md
```

The JavaScript code remains responsible for orchestration, safety checks, model calls, file writes, tests, retries, and reports. The Markdown templates define each Agent's role and working style.

## Fix Policy

Fix Agent is limited to 3 attempts.

```text
failed test or blocking review finding
-> fix attempt 1
-> retry checks
-> fix attempt 2
-> retry checks
-> fix attempt 3
-> retry checks
-> manual intervention report if still unresolved
```

When the system cannot resolve an issue after 3 attempts, it writes `manual-intervention-required.json` and the final report explains why a human needs to step in.

## Safety Boundaries

- Writes are constrained to the current workspace.
- Each task declares writable scopes.
- Shell commands are checked against an allowlist.
- Allowed shell commands include smoke tests, `npm test`, `npm run <script>`, safe `cd`, `git status`, `git add`, `git commit -m`, and normal `git push`.
- Destructive or broad shell behavior is blocked, including command chaining, redirects, forced pushes, deletes, downloads, shutdown, and format commands.
- Each run records plan, prompts, task logs, report, and Git before/after snapshots.
- Optional `--git-checkpoint` commits a compact run record and any Git-trackable generated files.
- `queue` mode processes external requirement files from an inbox directory.
- `doctor` checks Node.js, config, Agent templates, Git, and DeepSeek readiness.
- `.env`, `.vibe/runs/`, and `generated/` are excluded from Git by default.

## Next Milestones

1. Improve model JSON repair and retry.
2. Add optional automatic Git checkpoint commits.
3. Make Planner generate dynamic task graphs for different project types.
4. Add task parallelism and conflict handling.
