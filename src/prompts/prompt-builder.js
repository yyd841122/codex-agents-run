function buildPrompt({ plan, task, priorResults = [] }) {
  return [
    `# Agent: ${task.agent}`,
    "",
    `## Role`,
    findAgent(plan, task.agent),
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
        risks: []
      }, null, 2),
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
