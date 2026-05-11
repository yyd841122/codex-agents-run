const path = require("path");
const { ensureDir, writeText } = require("../tools/files");

function createGenericWebApp(outputRoot, plan) {
  ensureDir(outputRoot);
  const files = [
    write(outputRoot, "index.html", `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(plan.project.name)}</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main>
    <h1>${escapeHtml(plan.project.name)}</h1>
    <p>${escapeHtml(plan.requirement)}</p>
    <button id="action" type="button">Run</button>
    <output id="result">Ready</output>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`),
    write(outputRoot, "styles.css", `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #f6f7fb;
  color: #172033;
}

main {
  width: min(92vw, 520px);
}

button {
  min-height: 42px;
  border: 0;
  border-radius: 8px;
  padding: 0 16px;
  background: #1d7a5f;
  color: white;
  font-weight: 700;
}

output {
  display: block;
  margin-top: 16px;
}
`),
    write(outputRoot, "app.js", `"use strict";

document.getElementById("action").addEventListener("click", () => {
  document.getElementById("result").textContent = "Interaction completed.";
});
`),
    write(outputRoot, "smoke-test.js", `"use strict";

const fs = require("fs");
const path = require("path");

for (const file of ["index.html", "styles.css", "app.js"]) {
  if (!fs.existsSync(path.join(__dirname, file))) {
    throw new Error("Missing generated file: " + file);
  }
}

console.log("Smoke test passed.");
`)
  ];

  return files;
}

function write(root, name, content) {
  const fullPath = path.join(root, name);
  writeText(fullPath, content);
  return fullPath;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { createGenericWebApp };
