const path = require("path");
const { createPlan } = require("../planner/planner");
const { buildPrompt } = require("../prompts/prompt-builder");
const { runAgentTask } = require("../agents/agent-runner");
const { runAllowedCommand } = require("../tools/shell");
const { ensureDir, writeJson, writeText } = require("../tools/files");
const { captureGitSnapshot, createGitCheckpoint } = require("../tools/git");
const { collectFileContext } = require("../tools/file-context");
const { createReport } = require("../reports/report-generator");
const { loadAgentTemplate } = require("../prompts/agent-templates");

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
    model: options.model || "deepseek-v4-flash",
    deepseekTimeoutMs: options.deepseekTimeoutMs,
    agentTemplatesDir: options.agentTemplatesDir
  };

  writeJson(path.join(runDir, "git-before.json"), captureGitSnapshot(options.cwd));

  const plan = createPlan({
    requirement: options.requirement,
    cwd: options.cwd,
    fixMaxAttempts: options.fixMaxAttempts
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

    const prompt = createPromptWithContext({ plan, task, context });
    writeText(path.join(promptsDir, `${task.id}-${task.agent}.md`), prompt);

    logTaskStart(task, context);
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
        status: testResult.exitCode === 0 ? "completed" : "failed",
        summary: summarizeShellCheck(testResult)
      };
      taskResults[taskResults.length - 1] = merged;
      writeJson(path.join(tasksDir, `${task.id}.json`), merged);
    }
  }

  const fixResults = [];

  if (!options.dryRun) {
    for (let attempt = 1; attempt <= plan.fixPolicy.maxAttempts; attempt += 1) {
      let failedTests = unresolvedFailedTests(taskResults);
      let failedReviews = unresolvedFailedReviews(taskResults);
      let failedChecks = [...failedTests, ...failedReviews];

      if (!failedChecks.length && fixResults.length > 0) {
        await runReviewAfterFixIfNeeded({ plan, taskResults, promptsDir, tasksDir, context });
        failedTests = unresolvedFailedTests(taskResults);
        failedReviews = unresolvedFailedReviews(taskResults);
        failedChecks = [...failedTests, ...failedReviews];
      }

      if (!failedChecks.length) {
        break;
      }

      const fixTask = {
        id: `task-fix-${String(attempt).padStart(3, "0")}`,
        title: `Fix failed checks and review findings, attempt ${attempt} of ${plan.fixPolicy.maxAttempts}`,
        agent: "fixer",
        kind: "fix",
        scope: plan.writeScopes,
        acceptance: [
          "Previously failed tests pass",
          "Blocking review findings are resolved",
          `This is fix attempt ${attempt}; stop after ${plan.fixPolicy.maxAttempts} attempts and report manual intervention if unresolved`
        ],
        dependsOn: failedChecks.map((task) => task.id)
      };
      const prompt = createPromptWithContext({ plan, task: fixTask, context, priorResults: taskResults });
      writeText(path.join(promptsDir, `${fixTask.id}-${fixTask.agent}.md`), prompt);
      logTaskStart(fixTask, context);
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

      for (const failedReview of failedReviews) {
        const reviewTask = plan.tasks.find((task) => task.id === rootTaskId(failedReview.id));
        if (!reviewTask) {
          continue;
        }

        const reviewRetryTask = {
          ...reviewTask,
          id: `${reviewTask.id}-review-retry-${attempt}`,
          title: `Retry ${reviewTask.title}, attempt ${attempt}`,
          dependsOn: [fixResult.id]
        };
        const reviewRetryPrompt = createPromptWithContext({
          plan,
          task: reviewRetryTask,
          context,
          priorResults: taskResults
        });
        writeText(path.join(promptsDir, `${reviewRetryTask.id}-${reviewRetryTask.agent}.md`), reviewRetryPrompt);
        logTaskStart(reviewRetryTask, context);
        const reviewRetry = await runAgentTask({
          task: reviewRetryTask,
          plan,
          prompt: reviewRetryPrompt,
          context
        });
        taskResults.push(reviewRetry);
        writeJson(path.join(tasksDir, `${reviewRetryTask.id}.json`), reviewRetry);
      }
    }

    const remainingFailedTests = unresolvedFailedTests(taskResults);
    const remainingFailedReviews = unresolvedFailedReviews(taskResults);
    const remainingFailedChecks = [...remainingFailedTests, ...remainingFailedReviews];
    if (remainingFailedChecks.length) {
      const manualIntervention = {
        id: "manual-intervention-required",
        title: "Manual intervention required",
        agent: "orchestrator",
        kind: "report",
        status: "failed",
        changedFiles: [],
        summary: `Fix Agent reached ${plan.fixPolicy.maxAttempts} attempts without resolving all failed tests or blocking review findings. Human intervention is required.`,
        risks: remainingFailedChecks.map((task) => summarizeFailedCheck(task)),
        completedAt: new Date().toISOString()
      };
      taskResults.push(manualIntervention);
      writeJson(path.join(tasksDir, `${manualIntervention.id}.json`), manualIntervention);
    }
  }

  const report = createReport({ plan, taskResults, fixResults });
  const reportPath = path.join(runDir, "report.md");
  writeJson(path.join(runDir, "git-after.json"), captureGitSnapshot(options.cwd));
  writeText(reportPath, report);
  const checkpoint = maybeCreateCheckpoint({ options, plan, taskResults, report, runId, runDir, reportPath });

  return { runId, runDir, reportPath, checkpoint };
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

function unresolvedFailedReviews(taskResults) {
  return taskResults.filter((task) => {
    if (task.status !== "failed" || task.kind !== "review") {
      return false;
    }

    const rootId = rootTaskId(task.id);
    return !taskResults.some((candidate) => (
      candidate.kind === "review" &&
      candidate.id.startsWith(`${rootId}-review-retry-`) &&
      candidate.status === "completed"
    ));
  });
}

function rootTaskId(taskId) {
  return taskId.replace(/-retry-\d+$/, "").replace(/-review-retry-\d+$/, "").replace(/-after-fix$/, "");
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
  const reviewPrompt = createPromptWithContext({ plan, task: reviewAfterFixTask, context, priorResults: taskResults });
  writeText(path.join(promptsDir, `${reviewAfterFixTask.id}-${reviewAfterFixTask.agent}.md`), reviewPrompt);
  logTaskStart(reviewAfterFixTask, context);
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
  if (task.kind === "review") {
    const findings = Array.isArray(task.findings) ? task.findings : [];
    const blocking = findings.filter((finding) => finding.severity === "blocking");
    const details = blocking.length ? blocking.map((finding) => (
      `${finding.file || "unknown file"}: ${finding.issue || finding.recommendation || "Blocking review finding"}`
    )).join("; ") : (task.summary || "Blocking review failed.");
    return `${task.id} has unresolved blocking review findings: ${details.slice(0, 600)}`;
  }

  const stderr = task.shell && task.shell.stderr ? task.shell.stderr.trim() : "";
  const stdout = task.shell && task.shell.stdout ? task.shell.stdout.trim() : "";
  const details = stderr || stdout || "No command output captured.";
  return `${task.id} failed command "${task.shell.command}" with exit ${task.shell.exitCode}: ${details.slice(0, 600)}`;
}

function summarizeShellCheck(shell) {
  if (shell.exitCode === 0) {
    const details = shell.stdout && shell.stdout.trim()
      ? ` Output: ${shell.stdout.trim().slice(0, 300)}`
      : "";
    return `Shell check passed: ${shell.command} exited 0.${details}`;
  }

  const stderr = shell.stderr && shell.stderr.trim() ? shell.stderr.trim() : "";
  const stdout = shell.stdout && shell.stdout.trim() ? shell.stdout.trim() : "";
  const details = stderr || stdout || "No command output captured.";
  return `Shell check failed: ${shell.command} exited ${shell.exitCode}. ${details.slice(0, 300)}`;
}

function createPromptWithContext({ plan, task, context, priorResults = [] }) {
  const needsFileContext = task.kind === "review" || task.kind === "fix";
  const fileContext = needsFileContext
    ? collectFileContext({ cwd: context.cwd, scopes: task.scope })
    : [];
  const agentTemplate = loadAgentTemplate({
    cwd: context.cwd,
    agent: task.agent,
    templatesDir: context.agentTemplatesDir
  });

  return buildPrompt({ plan, task, priorResults, fileContext, agentTemplate });
}

function logTaskStart(task, context) {
  if (context.silent) {
    return;
  }

  const backend = context.dryRun
    ? "dry-run"
    : (context.llm === "deepseek" ? `deepseek/${context.model}` : context.llm);
  console.log(`Running ${task.id} (${task.agent}, ${task.kind}) with ${backend}...`);
}

function maybeCreateCheckpoint({ options, plan, taskResults, report, runId, runDir, reportPath }) {
  if (!options.gitCheckpoint || options.dryRun) {
    return null;
  }

  const recordDir = path.join(options.cwd, "records", "runs");
  const recordPath = path.join(recordDir, `${runId}.json`);
  const changedFiles = taskResults.flatMap((task) => task.changedFiles || []);
  const record = {
    runId,
    requirement: plan.requirement,
    finalStatus: extractFinalStatus(report),
    outputDir: plan.outputDir,
    changedFiles,
    reportPath: path.relative(options.cwd, reportPath),
    runDir: path.relative(options.cwd, runDir),
    completedAt: new Date().toISOString()
  };

  ensureDir(recordDir);
  writeJson(recordPath, record);

  const checkpoint = createGitCheckpoint({
    cwd: options.cwd,
    message: `Vibe checkpoint ${runId}`,
    paths: [recordPath, ...changedFiles],
    push: options.gitPush
  });
  writeJson(path.join(runDir, "git-checkpoint.json"), checkpoint);
  return checkpoint;
}

function extractFinalStatus(report) {
  const marker = "## Final Status";
  const markerIndex = report.indexOf(marker);
  if (markerIndex === -1) {
    return "Unknown";
  }

  const afterMarker = report.slice(markerIndex + marker.length).trim();
  return afterMarker.split(/\r?\n/).find(Boolean) || "Unknown";
}

function createRunId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `run-${stamp}-${suffix}`;
}

module.exports = { runWorkflow };
