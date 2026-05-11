const fs = require("fs");
const path = require("path");

const DEFAULT_AGENT_TEMPLATE = "Execute the assigned task only. Follow the workflow constraints and return the requested structured output.";

function loadAgentTemplate({ cwd, agent }) {
  const templatePath = path.join(cwd, "templates", "agents", `${agent}.md`);
  if (!fs.existsSync(templatePath)) {
    return {
      path: null,
      content: DEFAULT_AGENT_TEMPLATE
    };
  }

  return {
    path: templatePath,
    content: fs.readFileSync(templatePath, "utf8").trim()
  };
}

module.exports = { loadAgentTemplate };
