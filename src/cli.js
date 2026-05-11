#!/usr/bin/env node

const path = require("path");
const { runWorkflow } = require("./orchestrator/workflow");
const { inspectRun } = require("./orchestrator/inspect");
const { runBatch } = require("./orchestrator/batch");
const { loadDotEnv } = require("./tools/env");

async function main() {
  loadDotEnv(process.cwd());

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "run") {
    const request = collectRequest(args.slice(1));
    if (!request.text) {
      throw new Error("Missing requirement text. Example: vibe run \"create a snake game web app\"");
    }

    const cwd = process.cwd();
    const result = await runWorkflow({
      cwd,
      requirement: request.text,
      yes: request.flags.has("yes"),
      dryRun: request.flags.has("dry-run"),
      llm: request.options.llm || process.env.VIBE_LLM || "offline",
      model: request.options.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      deepseekTimeoutMs: request.options["deepseek-timeout-ms"] || process.env.DEEPSEEK_TIMEOUT_MS,
      gitCheckpoint: request.flags.has("git-checkpoint"),
      gitPush: request.flags.has("git-push")
    });

    console.log(`\nRun complete: ${result.runId}`);
    console.log(`Report: ${path.relative(cwd, result.reportPath)}`);
    if (result.checkpoint) {
      console.log(`Git checkpoint: ${result.checkpoint.status} - ${result.checkpoint.summary}`);
    }
    return;
  }

  if (command === "inspect") {
    const target = args[1] || "latest";
    const summary = inspectRun(process.cwd(), target);
    console.log(summary);
    return;
  }

  if (command === "batch") {
    const request = collectRequest(args.slice(1));
    const batchFile = request.text;
    const cwd = process.cwd();
    const result = await runBatch({
      cwd,
      file: batchFile,
      yes: request.flags.has("yes"),
      dryRun: request.flags.has("dry-run"),
      continueOnFailure: request.flags.has("continue-on-failure"),
      llm: request.options.llm || process.env.VIBE_LLM || "offline",
      model: request.options.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      deepseekTimeoutMs: request.options["deepseek-timeout-ms"] || process.env.DEEPSEEK_TIMEOUT_MS,
      gitCheckpoint: request.flags.has("git-checkpoint"),
      gitPush: request.flags.has("git-push")
    });

    console.log(`\nBatch complete: ${result.batchId}`);
    console.log(`Report: ${path.relative(cwd, result.reportPath)}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function collectRequest(args) {
  const flags = new Set();
  const options = {};
  const parts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const raw = arg.slice(2);
      if (raw.includes("=")) {
        const [key, ...valueParts] = raw.split("=");
        options[key] = valueParts.join("=");
      } else if (["llm", "model", "deepseek-timeout-ms"].includes(raw) && args[index + 1] && !args[index + 1].startsWith("--")) {
        options[raw] = args[index + 1];
        index += 1;
      } else {
        flags.add(raw);
      }
    } else {
      parts.push(arg);
    }
  }

  return {
    text: parts.join(" ").trim(),
    flags,
    options
  };
}

function printHelp() {
  console.log(`Vibe Agent MVP

Usage:
  vibe run "create a snake game web app" [--yes] [--dry-run]
  vibe run "create a snake game web app" --llm deepseek --yes
  vibe batch tasks.json --yes
  vibe batch tasks.json --yes --continue-on-failure
  vibe inspect latest
  vibe inspect list
  vibe inspect .vibe/runs/<run-id>

Options:
  --yes      Run allowed shell commands without interactive confirmation.
  --dry-run  Generate plan, prompts, and report without writing project files.
  --llm      Model backend: offline or deepseek.
  --model    DeepSeek model name. Default: deepseek-v4-flash.
  --deepseek-timeout-ms  DeepSeek request timeout. Default: 90000.
  --continue-on-failure  Batch mode only. Continue after a failed run.
  --git-checkpoint  Create a Git checkpoint commit with the run record and trackable changed files.
  --git-push  Push after creating a Git checkpoint. Requires --git-checkpoint.
`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
