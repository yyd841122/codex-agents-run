function buildPrompt({ plan, task, priorResults = [], fileContext = [], agentTemplate = null }) {
  const role = agentTemplate && agentTemplate.content
    ? agentTemplate.content
    : findAgent(plan, task.agent);

  return [
    `# Agent: ${task.agent}`,
    "",
    `## Role`,
    role,
    "",
    agentTemplate && agentTemplate.path ? `Template: ${agentTemplate.path}` : "",
    "",
    "## Project",
    `Requirement: ${plan.requirement}`,
    `Project: ${plan.project.name}`,
    `Stack: ${plan.project.stack}`,
    `Output directory: ${plan.outputDir}`,
    `Expected files: ${(plan.project.expectedFiles || []).join(", ")}`,
    "",
    "## Task",
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Kind: ${task.kind}`,
    `Writable scope: ${task.scope.join(", ")}`,
    "",
    "## Acceptance Criteria",
    ...task.acceptance.map((item) => `- ${item}`),
    "",
    "## Constraints",
    "- Only work inside declared writable scope.",
    "- Return structured output with status, changed files, summary, and risks.",
    "- Do not take over orchestration responsibilities.",
    task.kind === "code" || task.kind === "fix"
      ? "- For browser apps, smoke-test.js must run in plain Node.js using fs/string assertions only; do not use document, window, DOM mocks, jsdom, eval, or require browser scripts."
      : "",
    task.kind === "review"
      ? "- Mark findings as blocking only when they must be fixed before user acceptance."
      : "",
    "",
    "## Required Output Format",
    "Return only JSON. Do not wrap it in Markdown.",
    task.kind === "code" || task.kind === "fix"
      ? JSON.stringify({
        status: "completed",
        files: (plan.project.expectedFiles || ["index.html"]).map((file) => ({
          path: `${plan.outputDir}/${file}`,
          content: `full content for ${file}`
        })),
        summary: "What was implemented",
        risks: []
      }, null, 2)
      : JSON.stringify({
        status: "completed",
        summary: "What you did",
        risks: [],
        findings: task.kind === "review" ? [
          {
            severity: "info | warning | blocking",
            file: `${plan.outputDir}/index.html`,
            issue: "Finding description",
            recommendation: "Suggested change"
          }
        ] : []
      }, null, 2),
    "",
    fileContext.length ? "## Current Files" : "",
    ...fileContext.map((file) => [
      `### ${file.path}${file.truncated ? " (truncated)" : ""}`,
      "```",
      file.content,
      "```"
    ].join("\n")),
    "",
    priorResults.length ? "## Prior Results" : "",
    ...priorResults.map((result) => [
      `- ${result.id}: ${result.status} ${result.summary || ""}`,
      result.shell ? `  shell exit ${result.shell.exitCode}: ${result.shell.stderr || result.shell.stdout}` : ""
    ].filter(Boolean).join("\n"))
  ].filter(Boolean).join("\n");
}

function findAgent(plan, name) {
  const agent = plan.agents.find((item) => item.name === name);
  return agent ? agent.responsibility : "Execute the assigned task only.";
}

module.exports = { buildPrompt };
