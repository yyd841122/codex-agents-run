const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  llm: {
    provider: "offline",
    model: "deepseek-v4-flash",
    deepseekTimeoutMs: 90000
  },
  workflow: {
    fixMaxAttempts: 3,
    qualityFixWarnings: false
  },
  agents: {
    templatesDir: "templates/agents"
  },
  git: {
    checkpoint: false,
    push: false
  },
  batch: {
    continueOnFailure: false
  },
  queue: {
    inboxDir: ".vibe/inbox",
    processedDir: ".vibe/processed",
    failedDir: ".vibe/failed"
  }
};

function loadConfig(cwd) {
  const configPath = path.join(cwd, "vibe.config.json");
  if (!fs.existsSync(configPath)) {
    return {
      path: null,
      values: DEFAULT_CONFIG
    };
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    path: configPath,
    values: mergeConfig(DEFAULT_CONFIG, parsed)
  };
}

function resolveRunOptions({ cwd, request, config }) {
  const values = config.values;
  return {
    cwd,
    yes: request.flags.has("yes"),
    dryRun: request.flags.has("dry-run"),
    llm: request.options.llm || process.env.VIBE_LLM || values.llm.provider,
    model: request.options.model || process.env.DEEPSEEK_MODEL || values.llm.model,
    deepseekTimeoutMs: request.options["deepseek-timeout-ms"] || process.env.DEEPSEEK_TIMEOUT_MS || values.llm.deepseekTimeoutMs,
    fixMaxAttempts: numberOption(request.options["fix-max-attempts"], values.workflow.fixMaxAttempts),
    qualityFixWarnings: request.flags.has("quality-fix") || values.workflow.qualityFixWarnings,
    agentTemplatesDir: request.options["agent-templates-dir"] || values.agents.templatesDir,
    gitCheckpoint: request.flags.has("git-checkpoint") || values.git.checkpoint,
    gitPush: request.flags.has("git-push") || values.git.push,
    continueOnFailure: request.flags.has("continue-on-failure") || values.batch.continueOnFailure,
    queueInboxDir: request.options["queue-inbox-dir"] || values.queue.inboxDir,
    queueProcessedDir: request.options["queue-processed-dir"] || values.queue.processedDir,
    queueFailedDir: request.options["queue-failed-dir"] || values.queue.failedDir
  };
}

function mergeConfig(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      output[key] = mergeConfig(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function numberOption(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

module.exports = { loadConfig, resolveRunOptions };
