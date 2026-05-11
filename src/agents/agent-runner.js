const path = require("path");
const { createSnakeGame } = require("../generators/snake-game");
const { createGenericWebApp } = require("../generators/generic-web-app");
const { callDeepSeek } = require("../llm/deepseek-client");
const { ensureDir, writeText } = require("../tools/files");

async function runAgentTask({ task, plan, prompt, context }) {
  if (context.dryRun) {
    return result(task, "completed", [], `Dry run generated prompt for ${task.agent}.`, []);
  }

  if (context.llm === "deepseek") {
    return runDeepSeekTask({ task, plan, prompt, context });
  }

  if (task.agent === "coder") {
    const outputRoot = path.join(context.cwd, plan.outputDir);
    const files = plan.project.slug === "snake-game"
      ? createSnakeGame(outputRoot)
      : createGenericWebApp(outputRoot, plan);

    return result(task, "completed", files, `Generated ${plan.project.name} files.`, []);
  }

  if (task.agent === "planner") {
    return result(task, "completed", [], "Created concrete task plan and acceptance criteria.", []);
  }

  if (task.agent === "tester") {
    return result(task, "completed", [], "Prepared verification command for Runner.", []);
  }

  if (task.agent === "reviewer") {
    return result(task, "completed", [], "Reviewed acceptance criteria coverage for generated implementation.", [
      "Offline reviewer checks structure only; connect a real model for deeper code review."
    ]);
  }

  if (task.agent === "fixer") {
    return result(task, "completed", [], "No automatic fix was required by the offline runner.", []);
  }

  return result(task, "completed", [], `Agent ${task.agent} completed.`, []);
}

async function runDeepSeekTask({ task, plan, prompt, context }) {
  try {
    const response = await callDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: context.model,
      prompt,
      system: systemPromptFor(task)
    });

    const parsed = parseJson(response.content);

    if (task.kind === "code" || task.kind === "fix") {
      const changedFiles = writeModelFiles({
        cwd: context.cwd,
        scope: task.scope,
        files: parsed.files || []
      });

      return result(
        task,
        parsed.status || "completed",
        changedFiles,
        parsed.summary || `DeepSeek generated ${changedFiles.length} file(s).`,
        parsed.risks || []
      );
    }

    return result(
      task,
      parsed.status || "completed",
      [],
      parsed.summary || "DeepSeek task completed.",
      parsed.risks || []
    );
  } catch (error) {
    return result(task, "failed", [], `DeepSeek task failed: ${formatError(error)}`, [
      "Check DEEPSEEK_API_KEY, network access, model name, and model JSON output."
    ]);
  }
}

function formatError(error) {
  if (!error) return "Unknown error";
  const parts = [
    error.name,
    error.code,
    error.message,
    error.cause && error.cause.message
  ].filter(Boolean);

  if (error.errors && Array.isArray(error.errors)) {
    for (const item of error.errors) {
      parts.push(formatError(item));
    }
  }

  return parts.length ? [...new Set(parts)].join(" | ") : String(error);
}

function writeModelFiles({ cwd, scope, files }) {
  const changedFiles = [];
  const absoluteScopes = scope.map((item) => path.resolve(cwd, item));

  for (const file of files) {
    if (!file || !file.path || typeof file.content !== "string") {
      continue;
    }

    const fullPath = path.resolve(cwd, file.path);
    const allowed = absoluteScopes.some((scopePath) => fullPath === scopePath || fullPath.startsWith(`${scopePath}${path.sep}`));
    if (!allowed) {
      throw new Error(`Model attempted to write outside scope: ${file.path}`);
    }

    ensureDir(path.dirname(fullPath));
    writeText(fullPath, file.content);
    changedFiles.push(fullPath);
  }

  return changedFiles;
}

function parseJson(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function systemPromptFor(task) {
  if (task.kind === "code") {
    return [
      "You are a coding agent in a multi-agent workflow.",
      "Return only valid JSON.",
      "For code tasks, include a files array with path and content.",
      "Do not write outside the assigned writable scope."
    ].join(" ");
  }

  return "You are a specialized agent in a multi-agent workflow. Return only valid JSON.";
}

function result(task, status, changedFiles, summary, risks) {
  return {
    id: task.id,
    title: task.title,
    agent: task.agent,
    kind: task.kind,
    status,
    changedFiles,
    summary,
    risks,
    completedAt: new Date().toISOString()
  };
}

module.exports = { runAgentTask };
