const fs = require("fs");
const path = require("path");

function inspectRun(cwd, target) {
  if (target === "list") {
    return listRuns(cwd);
  }

  const runDir = resolveRunDir(cwd, target || "latest");
  const planPath = path.join(runDir, "plan.json");
  const reportPath = path.join(runDir, "report.md");
  const tasksDir = path.join(runDir, "tasks");

  if (!fs.existsSync(planPath)) {
    throw new Error(`Run plan not found: ${planPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "Report not generated yet.";
  const taskResults = readTaskResults(tasksDir);
  const finalStatus = extractFinalStatus(report);
  const failed = taskResults.filter((task) => task.status === "failed");
  const skipped = taskResults.filter((task) => task.status === "skipped");
  const fixAttempts = taskResults.filter((task) => task.kind === "fix").length;

  return [
    `Run: ${path.basename(runDir)}`,
    `Requirement: ${plan.requirement}`,
    `Tasks: ${plan.tasks.length}`,
    `Final Status: ${finalStatus}`,
    `Failed Tasks: ${failed.length}`,
    `Skipped Tasks: ${skipped.length}`,
    `Fix Attempts: ${fixAttempts}/${plan.fixPolicy ? plan.fixPolicy.maxAttempts : 0}`,
    "",
    report
  ].join("\n");
}

function listRuns(cwd) {
  const runs = findRuns(cwd);
  if (!runs.length) {
    return "No runs found.";
  }

  return [
    "Recent runs:",
    ...runs.slice(0, 20).map((run) => {
      const planPath = path.join(run.fullPath, "plan.json");
      const reportPath = path.join(run.fullPath, "report.md");
      const plan = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, "utf8")) : null;
      const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
      return [
        `- ${run.name}`,
        `  status: ${extractFinalStatus(report)}`,
        `  requirement: ${plan ? plan.requirement : "unknown"}`
      ].join("\n");
    })
  ].join("\n");
}

function resolveRunDir(cwd, target) {
  if (target === "latest") {
    const latest = findRuns(cwd)[0];
    if (!latest) {
      throw new Error("No runs found.");
    }
    return latest.fullPath;
  }

  const direct = path.resolve(cwd, target);
  if (fs.existsSync(direct)) {
    return direct;
  }

  const fromRuns = path.join(cwd, ".vibe", "runs", target);
  if (fs.existsSync(fromRuns)) {
    return fromRuns;
  }

  return direct;
}

function findRuns(cwd) {
  const runsDir = path.join(cwd, ".vibe", "runs");
  if (!fs.existsSync(runsDir)) {
    return [];
  }

  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(runsDir, entry.name);
      return {
        name: entry.name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function readTaskResults(tasksDir) {
  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  return fs.readdirSync(tasksDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(tasksDir, file), "utf8")));
}

function extractFinalStatus(report) {
  if (!report) {
    return "Report not generated";
  }

  const marker = "## Final Status";
  const markerIndex = report.indexOf(marker);
  if (markerIndex === -1) {
    return "Unknown";
  }

  const afterMarker = report.slice(markerIndex + marker.length).trim();
  const firstLine = afterMarker.split(/\r?\n/).find(Boolean);
  return firstLine || "Unknown";
}

module.exports = { inspectRun, listRuns };
