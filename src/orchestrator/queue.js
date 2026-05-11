const fs = require("fs");
const path = require("path");
const { runWorkflow } = require("./workflow");
const { ensureDir, writeJson, writeText } = require("../tools/files");

async function runQueue(options) {
  const inboxDir = path.resolve(options.cwd, options.queueInboxDir);
  const processedDir = path.resolve(options.cwd, options.queueProcessedDir);
  const failedDir = path.resolve(options.cwd, options.queueFailedDir);
  const queueId = createQueueId();
  const queueDir = path.join(options.cwd, ".vibe", "queues", queueId);
  const results = [];

  ensureDir(inboxDir);
  ensureDir(processedDir);
  ensureDir(failedDir);
  ensureDir(queueDir);

  const entries = listQueueFiles(inboxDir);
  if (!entries.length) {
    const reportPath = path.join(queueDir, "report.md");
    writeText(reportPath, createQueueReport({ queueId, inboxDir, results }));
    return { queueId, queueDir, reportPath, results };
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const requirement = readRequirement(entry.fullPath);
    const result = {
      index: index + 1,
      source: entry.fullPath,
      requirement,
      status: "pending"
    };

    if (!requirement) {
      result.status = "failed";
      result.summary = "Queue item has no requirement.";
      moveQueueFile(entry.fullPath, failedDir);
      results.push(result);
      continue;
    }

    console.log(`\nQueue ${queueId}: running ${index + 1}/${entries.length} from ${entry.name}`);
    const run = await runWorkflow({
      cwd: options.cwd,
      requirement,
      yes: options.yes,
      dryRun: options.dryRun,
      llm: options.llm,
      model: options.model,
      deepseekTimeoutMs: options.deepseekTimeoutMs,
      fixMaxAttempts: options.fixMaxAttempts,
      agentTemplatesDir: options.agentTemplatesDir,
      gitCheckpoint: options.gitCheckpoint,
      gitPush: options.gitPush
    });

    const report = readText(run.reportPath);
    result.runId = run.runId;
    result.runDir = run.runDir;
    result.reportPath = run.reportPath;
    result.status = extractFinalStatus(report);
    result.summary = isCompleted(result.status) ? "Completed." : "Needs attention.";
    moveQueueFile(entry.fullPath, isCompleted(result.status) ? processedDir : failedDir);
    results.push(result);
    writeJson(path.join(queueDir, "results.json"), results);

    if (!options.continueOnFailure && !isCompleted(result.status)) {
      console.log(`Queue stopped because ${entry.name} finished with status: ${result.status}`);
      break;
    }
  }

  const reportPath = path.join(queueDir, "report.md");
  writeText(reportPath, createQueueReport({ queueId, inboxDir, results }));
  writeJson(path.join(queueDir, "results.json"), results);

  return { queueId, queueDir, reportPath, results };
}

function listQueueFiles(inboxDir) {
  return fs.readdirSync(inboxDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => [".txt", ".json"].includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const fullPath = path.join(inboxDir, entry.name);
      return {
        name: entry.name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
}

function readRequirement(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return "";
  }

  if (path.extname(filePath).toLowerCase() === ".json") {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed.trim();
    if (parsed && typeof parsed.requirement === "string") return parsed.requirement.trim();
    return "";
  }

  return raw;
}

function moveQueueFile(source, targetDir) {
  const target = uniqueTargetPath(targetDir, path.basename(source));
  fs.renameSync(source, target);
  return target;
}

function uniqueTargetPath(targetDir, fileName) {
  const parsed = path.parse(fileName);
  let target = path.join(targetDir, fileName);
  let index = 1;
  while (fs.existsSync(target)) {
    target = path.join(targetDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return target;
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
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

function createQueueReport({ queueId, inboxDir, results }) {
  const completed = results.filter((result) => isCompleted(result.status)).length;
  return [
    "# Vibe Queue Report",
    "",
    `Queue: ${queueId}`,
    `Inbox: ${inboxDir}`,
    `Processed: ${completed}/${results.length}`,
    `Status: ${completed === results.length ? "Completed" : "Needs attention"}`,
    "",
    "## Items",
    ...(results.length ? results.map((result) => [
      `- ${result.index}. ${result.status}`,
      `  source: ${result.source}`,
      `  requirement: ${result.requirement || "(empty)"}`,
      result.runId ? `  run: ${result.runId}` : "  run: none",
      result.reportPath ? `  report: ${result.reportPath}` : "  report: none"
    ].join("\n")) : ["- No queue items found."])
  ].join("\n");
}

function createQueueId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `queue-${stamp}-${suffix}`;
}

module.exports = { runQueue };
