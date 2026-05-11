const path = require("path");

function createPlan(input) {
  const normalized = input.requirement.toLowerCase();
  const project = inferProject(normalized);
  const outputDir = path.join("generated", project.slug);

  const tasks = [
    {
      id: "task-001",
      title: "Clarify requirement and acceptance criteria",
      agent: "planner",
      kind: "analysis",
      scope: [".vibe"],
      dependsOn: [],
      acceptance: ["Requirement is converted into concrete acceptance criteria"]
    },
    {
      id: "task-002",
      title: `Generate ${project.name} implementation`,
      agent: "coder",
      kind: "code",
      scope: [outputDir],
      dependsOn: ["task-001"],
      acceptance: project.acceptance
    },
    {
      id: "task-003",
      title: "Run project verification",
      agent: "tester",
      kind: "test",
      command: `node ${outputDir}/smoke-test.js`,
      scope: [outputDir],
      dependsOn: ["task-002"],
      acceptance: ["Verification command exits with code 0"]
    },
    {
      id: "task-004",
      title: "Review implementation against acceptance criteria",
      agent: "reviewer",
      kind: "review",
      scope: [outputDir],
      dependsOn: ["task-003"],
      acceptance: ["Implementation satisfies acceptance criteria", "Report lists residual risks"]
    }
  ];

  return {
    version: "0.1",
    requirement: input.requirement,
    project,
    outputDir,
    writeScopes: [outputDir, ".vibe"],
    agents: [
      agent("orchestrator", "Coordinate only; do not directly implement product code."),
      agent("planner", "Turn user requirements into bounded tasks and acceptance criteria."),
      agent("coder", "Implement code within declared scope."),
      agent("tester", "Run checks and summarize failures."),
      agent("reviewer", "Review implementation quality and acceptance coverage."),
      agent("fixer", "Apply focused fixes based on failed checks."),
      agent("reporter", "Summarize delivery, changes, checks, and risks.")
    ],
    tasks,
    fixPolicy: {
      maxAttempts: input.fixMaxAttempts || 3
    }
  };
}

function inferProject(normalized) {
  if (normalized.includes("snake") || normalized.includes("贪吃蛇")) {
    return {
      type: "web-game",
      name: "Snake Game",
      slug: "snake-game",
      stack: "HTML/CSS/JavaScript",
      expectedFiles: ["index.html", "styles.css", "game.js", "smoke-test.js"],
      acceptance: [
        "Player can start and restart the game",
        "Snake moves continuously",
        "Arrow keys and touch swipes change direction",
        "Eating food increases score and snake length",
        "Wall or self collision ends the game"
      ]
    };
  }

  return {
    type: "web-app",
    name: "Generated Web App",
    slug: "web-app",
    stack: "HTML/CSS/JavaScript",
    expectedFiles: ["index.html", "styles.css", "app.js", "smoke-test.js"],
    acceptance: [
      "App has a usable first screen",
      "Core interaction works without external dependencies",
      "Smoke test can verify generated files"
    ]
  };
}

function agent(name, responsibility) {
  return { name, responsibility };
}

module.exports = { createPlan };
