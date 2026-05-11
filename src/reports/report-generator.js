function createReport({ plan, taskResults, fixResults = [] }) {
  const changedFiles = unique(taskResults.flatMap((task) => task.changedFiles || []));
  const failed = unresolvedFailures(taskResults);
  const manualIntervention = taskResults.find((task) => task.id === "manual-intervention-required");

  return [
    `# Vibe Run Report`,
    "",
    `## Requirement`,
    plan.requirement,
    "",
    `## Project`,
    `- Name: ${plan.project.name}`,
    `- Type: ${plan.project.type}`,
    `- Stack: ${plan.project.stack}`,
    `- Output: ${plan.outputDir}`,
    "",
    `## Task Results`,
    ...taskResults.map((task) => `- ${task.id} ${task.agent}: ${task.status} - ${task.summary || ""}`),
    "",
    `## Changed Files`,
    ...(changedFiles.length ? changedFiles.map((file) => `- ${file}`) : ["- None"]),
    "",
    `## Acceptance Criteria`,
    ...plan.project.acceptance.map((item) => `- ${item}`),
    "",
    `## Checks`,
    ...taskResults
      .filter((task) => task.shell)
      .map((task) => `- ${task.shell.command}: exit ${task.shell.exitCode}`),
    "",
    `## Risks`,
    ...collectRisks(taskResults),
    "",
    `## Review Findings`,
    ...collectFindings(taskResults),
    "",
    `## Final Status`,
    finalStatus(failed, manualIntervention),
    fixResults.length ? `\nFix attempts: ${fixResults.length}/${plan.fixPolicy.maxAttempts}` : "",
    manualIntervention ? `\nManual intervention reason: ${manualIntervention.summary}` : ""
  ].join("\n");
}

function collectRisks(taskResults) {
  const risks = taskResults.flatMap((task) => task.risks || []);
  return risks.length ? risks.map((risk) => `- ${risk}`) : ["- No known blocking risks in MVP run."];
}

function collectFindings(taskResults) {
  const findings = taskResults.flatMap((task) => {
    if (!Array.isArray(task.findings) || !task.findings.length) {
      return [];
    }

    return task.findings.map((finding) => ({
      taskId: task.id,
      ...finding
    }));
  });

  if (!findings.length) {
    return ["- None"];
  }

  return findings.map((finding) => [
    `- ${finding.severity || "info"} ${finding.taskId}`,
    finding.file ? `  file: ${finding.file}` : "",
    finding.issue ? `  issue: ${finding.issue}` : "",
    finding.recommendation ? `  recommendation: ${finding.recommendation}` : ""
  ].filter(Boolean).join("\n"));
}

function unique(values) {
  return [...new Set(values)];
}

function unresolvedFailures(taskResults) {
  return taskResults.filter((task) => {
    if (task.status === "skipped") {
      return false;
    }

    if (task.id.includes("-retry-")) return false;

    if (task.status !== "failed") return false;
    if (task.kind === "review") {
      const rootId = task.id.replace(/-review-retry-\d+$/, "").replace(/-after-fix$/, "");
      const reviewRetryPassed = taskResults.some((candidate) => (
        candidate.kind === "review" &&
        candidate.id.startsWith(`${rootId}-review-retry-`) &&
        candidate.status === "completed"
      ));
      return !reviewRetryPassed;
    }

    const retryPassed = taskResults.some((candidate) => (
      candidate.id.startsWith(`${task.id}-retry-`) && candidate.status === "completed"
    ));
    return !retryPassed;
  });
}

function finalStatus(failed, manualIntervention) {
  if (manualIntervention) {
    return `Needs manual intervention. Failed tasks: ${failed.map((task) => task.id).join(", ")}.`;
  }

  if (failed.length === 0) {
    return "Completed.";
  }

  return `Needs attention. Failed tasks: ${failed.map((task) => task.id).join(", ")}.`;
}

module.exports = { createReport };
