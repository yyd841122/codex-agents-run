const fs = require("fs");
const path = require("path");

function inspectRun(runDir) {
  const planPath = path.join(runDir, "plan.json");
  const reportPath = path.join(runDir, "report.md");

  if (!fs.existsSync(planPath)) {
    throw new Error(`Run plan not found: ${planPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "Report not generated yet.";

  return [
    `Run: ${path.basename(runDir)}`,
    `Requirement: ${plan.requirement}`,
    `Tasks: ${plan.tasks.length}`,
    "",
    report
  ].join("\n");
}

module.exports = { inspectRun };
