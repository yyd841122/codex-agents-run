const fs = require("fs");
const path = require("path");
const { captureGitSnapshot } = require("../tools/git");

function runDoctor({ cwd, config }) {
  const checks = [
    checkNodeVersion(),
    checkConfig(config),
    checkAgentTemplates(cwd, config.values.agents.templatesDir),
    checkGit(cwd),
    checkDeepSeek(config)
  ];

  const failed = checks.filter((check) => check.status === "failed");
  const warnings = checks.filter((check) => check.status === "warning");

  return [
    "Vibe Doctor",
    "",
    ...checks.map((check) => `${icon(check.status)} ${check.name}: ${check.summary}`),
    "",
    `Summary: ${failed.length ? "failed" : (warnings.length ? "warnings" : "ok")}`
  ].join("\n");
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "Node.js",
    status: major >= 18 ? "passed" : "failed",
    summary: `current ${process.versions.node}; requires >=18`
  };
}

function checkConfig(config) {
  return {
    name: "Config",
    status: config.path ? "passed" : "warning",
    summary: config.path ? `loaded ${config.path}` : "vibe.config.json not found; using built-in defaults"
  };
}

function checkAgentTemplates(cwd, templatesDir) {
  const required = ["planner", "coder", "tester", "reviewer", "fixer"];
  const missing = required.filter((agent) => !fs.existsSync(path.resolve(cwd, templatesDir, `${agent}.md`)));
  return {
    name: "Agent templates",
    status: missing.length ? "failed" : "passed",
    summary: missing.length ? `missing ${missing.join(", ")}` : `loaded from ${templatesDir}`
  };
}

function checkGit(cwd) {
  const snapshot = captureGitSnapshot(cwd);
  return {
    name: "Git",
    status: snapshot.isGitRepo ? "passed" : "warning",
    summary: snapshot.isGitRepo ? "repository detected" : "not a Git repository"
  };
}

function checkDeepSeek(config) {
  const provider = config.values.llm.provider;
  if (provider !== "deepseek" && process.env.VIBE_LLM !== "deepseek") {
    return {
      name: "DeepSeek",
      status: "passed",
      summary: "not required for current default provider"
    };
  }

  return {
    name: "DeepSeek",
    status: process.env.DEEPSEEK_API_KEY ? "passed" : "failed",
    summary: process.env.DEEPSEEK_API_KEY ? "DEEPSEEK_API_KEY is set" : "DEEPSEEK_API_KEY is missing"
  };
}

function icon(status) {
  if (status === "passed") return "[OK]";
  if (status === "warning") return "[WARN]";
  return "[FAIL]";
}

module.exports = { runDoctor };
