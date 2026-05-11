const path = require("path");
const { createPlan } = require("../planner/planner");
const { buildPrompt } = require("../prompts/prompt-builder");
const { runAgentTask } = require("../agents/agent-runner");
const { runAllowedCommand } = require("../tools/shell");
const { ensureDir, writeJson, writeText } = require("../tools/files");
const { captureGitSnapshot } = require("../tools/git");
const { createReport } = require("../reports/report-generator");

async function runWorkflow(options) {
  const runId = createRunId();
  const runDir = path.join(options.cwd, ".vibe", "runs", runId);
  const promptsDir = path.join(runDir, "prompts");
  const tasksDir = path.join(runDir, "tasks");

  ensureDir(promptsDir);
  ensureDir(tasksDir);

  const context = {
    cwd: options.cwd,
    runId,
    runDir,
    dryRun: options.dryRun,
    yes: options.yes,
    llm: options.llm || "offline",
    model: options.model || "deepseek-v4-flash"
  };

  writeJson(path.join(runDir, "git-before.json"), captureGitSnapshot(options.cwd));

  const plan = createPlan({
    requirement: options.requirement,
    cwd: options.cwd
  });

  writeJson(path.join(runDir, "plan.json"), plan);

  const taskResults = [];

  for (const task of plan.tasks) {
    const blockedBy = task.dependsOn.filter((dependencyId) => {
      const dependency = taskResults.find((result) => result.id === dependencyId);
      return dependency && dependency.status !== "completed";
    });

    if (blockedBy.length) {
      const skipped = {
        id: task.id,
        title: task.title,
        agent: task.agent,
        kind: task.kind,
        status: "skipped",
        changedFiles: [],
        summary: `Skipped because dependencies did not complete: ${blockedBy.join(", ")}`,
        risks: [],
        completedAt: new Date().toISOString()
      };
      taskResults.push(skipped);
      writeJson(path.join(tasksDir, `${task.id}.json`), skipped);
      continue;
    }

    const prompt = buildPrompt({ plan, task });
    writeText(path.join(promptsDir, `${task.id}-${task.agent}.md`), prompt);

    const result = await runAgentTask({ task, plan, prompt, context });
    taskResults.push(result);
    writeJson(path.join(tasksDir, `${task.id}.json`), result);

    if (task.kind === "test" && !options.dryRun) {
      const testResult = await runAllowedCommand({
        cwd: options.cwd,
        command: task.command,
        yes: options.yes
      });
      const merged = {
        ...result,
        shell: testResult,
        status: testResult.exitCode === 0 ? "completed" : "failed"
      };
      taskResults[taskResults.length - 1] = merged;
      writeJson(path.join(tasksDir, `${task.id}.json`), merged);
    }
  }

  const fixResults = [];

  if (!options.dryRun) {
    for (let attempt = 1; attempt <= plan.fixPolicy.maxAttempts; attempt += 1) {
      const failedTests = unresolvedFailedTests(taskResults);
      if (!failedTests.length) {
        break;
      }

      const fixTask = {
        id: `task-fix-${String(attempt).padStart(3, "0")}`,
        title: `Fix failed checks, attempt ${attempt} of ${plan.fixPolicy.maxAttempts}`,
        agent: "fixer",
        kind: "fix",
        scope: plan.writeScopes,
        acceptance: [
          "Previously failed checks pass",
          `This is fix attempt ${attempt}; stop after ${plan.fixPolicy.maxAttempts} attempts and report manual intervention if unresolved`
        ],
        dependsOn: failedTests.map((task) => task.id)
      };
      const prompt = buildPrompt({ plan, task: fixTask, priorResults: taskResults });
      writeText(path.join(promptsDir, `${fixTask.id}-${fixTask.agent}.md`), prompt);
      const fixResult = await runAgentTask({ task: fixTask, plan, prompt, context });
      writeJson(path.join(tasksDir, `${fixTask.id}.json`), fixResult);
      taskResults.push(fixResult);
      fixResults.push(fixResult);

      if (fixResult.status !== "completed") {
        continue;
      }

      for (const failedTask of failedTests) {
        const retry = await runAllowedCommand({
          cwd: options.cwd,
          command: failedTask.shell.command,
          yes: options.yes
        });
        const retryResult = {
          id: `${failedTask.id}-retry-${attempt}`,
          title: `Retry ${failedTask.title}, attempt ${attempt}`,
          agent: failedTask.agent,
          kind: failedTask.kind,
          status: retry.exitCode === 0 ? "completed" : "failed",
          changedFiles: [],
          summary: `Retried after fix attempt ${attempt}: ${retry.exitCode === 0 ? "passed" : "failed"}.`,
          risks: [],
          completedAt: new Date().toISOString(),
          shell: retry
        };
        taskResults.push(retryResult);
        writeJson(path.join(tasksDir, `${retryResult.id}.json`), retryResult);
      }
    }

    const remainingFailedTests = unresolvedFailedTests(taskResults);
    if (remainingFailedTests.length) {
      const manualIntervention = {
        id: "manual-intervention-required",
        title: "Manual intervention required",
        agent: "orchestrator",
        kind: "report",
        status: "failed",
        changedFiles: [],
        summary: `Fix Agent reached ${plan.fixPolicy.maxAttempts} attempts without resolving all failed checks. Human intervention is required.`,
        risks: remainingFailedTests.map((task) => summarizeFailedCheck(task)),
        completedAt: new Date().toISOString()
      };
      taskResults.push(manualIntervention);
      writeJson(path.join(tasksDir, `${manualIntervention.id}.json`), manualIntervention);
    } else if (fixResults.length > 0) {
      await runReviewAfterFixIfNeeded({ plan, taskResults, promptsDir, tasksDir, context });
    }
  }

  const report = createReport({ plan, taskResults, fixResults });
  const reportPath = path.join(runDir, "report.md");
  writeJson(path.join(runDir, "git-after.json"), captureGitSnapshot(options.cwd));
  writeText(reportPath, report);

  return { runId, runDir, reportPath };
}

function unresolvedFailedTests(taskResults) {
  return taskResults.filter((task) => {
    if (task.status !== "failed" || task.kind !== "test" || !task.shell || task.id.includes("-retry-")) {
      return false;
    }

    return !taskResults.some((candidate) => (
      candidate.id.startsWith(`${task.id}-retry-`) && candidate.status === "completed"
    ));
  });
}

async function runReviewAfterFixIfNeeded({ plan, taskResults, promptsDir, tasksDir, context }) {
  const skippedReview = taskResults.find((task) => task.kind === "review" && task.status === "skipped");
  if (!skippedReview) {
    return;
  }

  const reviewTask = plan.tasks.find((task) => task.id === skippedReview.id);
  if (!reviewTask) {
    return;
  }

  const successfulRetries = taskResults.filter((task) => task.kind === "test" && task.id.includes("-retry-") && task.status === "completed");
  const reviewAfterFixTask = {
    ...reviewTask,
    id: `${reviewTask.id}-after-fix`,
    title: `${reviewTask.title} after fix`,
    dependsOn: successfulRetries.map((task) => task.id)
  };
  const reviewPrompt = buildPrompt({ plan, task: reviewAfterFixTask, priorResults: taskResults });
  writeText(path.join(promptsDir, `${reviewAfterFixTask.id}-${reviewAfterFixTask.agent}.md`), reviewPrompt);
  const reviewAfterFix = await runAgentTask({
    task: reviewAfterFixTask,
    plan,
    prompt: reviewPrompt,
    context
  });
  taskResults.push(reviewAfterFix);
  writeJson(path.join(tasksDir, `${reviewAfterFixTask.id}.json`), reviewAfterFix);
}

function summarizeFailedCheck(task) {
  const stderr = task.shell && task.shell.stderr ? task.shell.stderr.trim() : "";
  const stdout = task.shell && task.shell.stdout ? task.shell.stdout.trim() : "";
  const details = stderr || stdout || "No command output captured.";
  return `${task.id} failed command "${task.shell.command}" with exit ${task.shell.exitCode}: ${details.slice(0, 600)}`;
}

function createRunId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `run-${stamp}-${suffix}`;
}

module.exports = { runWorkflow };
