const fs = require("fs");
const path = require("path");
const { runWorkflow } = require("./workflow");
const { ensureDir, writeJson, writeText } = require("../tools/files");

async function runBatch(options) {
  const batch = loadBatch(options.file);
  const batchId = createBatchId();
  const batchDir = path.join(options.cwd, ".vibe", "batches", batchId);
  const results = [];

  ensureDir(batchDir);
  writeJson(path.join(batchDir, "batch.json"), {
    id: batchId,
    source: path.resolve(options.cwd, options.file),
    tasks: batch.tasks,
    startedAt: new Date().toISOString()
  });

  for (let index = 0; index < batch.tasks.length; index += 1) {
    const item = batch.tasks[index];
    const requirement = normalizeRequirement(item);
    if (!requirement) {
      const skipped = {
        index: index + 1,
        requirement: "",
        status: "skipped",
        summary: "Skipped empty requirement."
      };
      results.push(skipped);
      continue;
    }

    console.log(`\nBatch ${batchId}: running ${index + 1}/${batch.tasks.length}`);
    const run = await runWorkflow({
      cwd: options.cwd,
      requirement,
      yes: options.yes,
      dryRun: options.dryRun,
      llm: options.llm,
      model: options.model,
      deepseekTimeoutMs: options.deepseekTimeoutMs
    });

    const report = readReport(run.reportPath);
    const status = extractFinalStatus(report);
    const result = {
      index: index + 1,
      requirement,
      status,
      runId: run.runId,
      runDir: run.runDir,
      reportPath: run.reportPath
    };
    results.push(result);
    writeJson(path.join(batchDir, "results.json"), results);

    if (!options.continueOnFailure && !isCompleted(status)) {
      console.log(`Batch stopped because task ${index + 1} finished with status: ${status}`);
      break;
    }
  }

  const report = createBatchReport({ batchId, source: options.file, results });
  const reportPath = path.join(batchDir, "report.md");
  writeText(reportPath, report);
  writeJson(path.join(batchDir, "results.json"), results);

  return { batchId, batchDir, reportPath, results };
}

function loadBatch(file) {
  if (!file) {
    throw new Error("Missing batch file. Example: vibe batch tasks.json --yes");
  }

  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Batch file not found: ${fullPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!Array.isArray(tasks)) {
    throw new Error("Batch file must be a JSON array or an object with a tasks array.");
  }

  return { tasks };
}

function normalizeRequirement(item) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (item && typeof item.requirement === "string") {
    return item.requirement.trim();
  }

  return "";
}

function readReport(reportPath) {
  return fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
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

function isCompleted(status) {
  return status === "Completed.";
}

function createBatchReport({ batchId, source, results }) {
  const completed = results.filter((result) => isCompleted(result.status)).length;
  const stopped = results.some((result) => !isCompleted(result.status));

  return [
    "# Vibe Batch Report",
    "",
    `Batch: ${batchId}`,
    `Source: ${source}`,
    `Completed: ${completed}/${results.length}`,
    `Status: ${stopped ? "Needs attention" : "Completed"}`,
    "",
    "## Runs",
    ...results.map((result) => [
      `- ${result.index}. ${result.status}`,
      `  requirement: ${result.requirement || "(empty)"}`,
      result.runId ? `  run: ${result.runId}` : "  run: none",
      result.reportPath ? `  report: ${result.reportPath}` : "  report: none"
    ].join("\n"))
  ].join("\n");
}

function createBatchId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `batch-${stamp}-${suffix}`;
}

module.exports = { runBatch };
