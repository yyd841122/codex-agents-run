const fs = require("fs");
const path = require("path");
const { writeText } = require("./files");

function enforceSmokeTestPolicy({ cwd, plan }) {
  if (!plan || !plan.project || plan.project.stack !== "HTML/CSS/JavaScript") {
    return [];
  }

  const smokePath = path.join(cwd, plan.outputDir, "smoke-test.js");
  if (!fs.existsSync(smokePath)) {
    return [];
  }

  const current = fs.readFileSync(smokePath, "utf8");
  if (!needsStaticSmokeTest(current)) {
    return [];
  }

  writeText(smokePath, buildStaticSmokeTest(plan));
  return [smokePath];
}

function needsStaticSmokeTest(content) {
  const riskyPatterns = [
    /\bdocument\./,
    /\bwindow\./,
    /\bglobal\.document\b/,
    /\beval\s*\(/,
    /require\s*\(\s*['"]\.\/?game\.js['"]\s*\)/,
    /readFileSync\s*\([^)]*game\.js/
  ];
  return riskyPatterns.some((pattern) => pattern.test(content));
}

function buildStaticSmokeTest(plan) {
  const expectedFiles = plan.project.expectedFiles || ["index.html"];
  const jsFile = expectedFiles.find((file) => file.endsWith(".js") && file !== "smoke-test.js") || "app.js";
  const requirementText = [plan.requirement, ...(plan.project.acceptance || [])].join(" ");
  const shouldCheckTouch = /touch|swipe|\u89e6\u6478|\u6ed1\u52a8/i.test(requirementText);
  const shouldCheckRestart = /restart|reset|\u91cd\u65b0\u5f00\u59cb/i.test(requirementText);
  const shouldCheckPause = /pause|resume|\u6682\u505c|\u7ee7\u7eed/i.test(requirementText);
  const shouldCheckCollision = /collision|wall|self|game over|gameover|\u8fb9\u754c|\u649e/i.test(requirementText);

  const checks = [
    "const fs = require('fs');",
    "const path = require('path');",
    "",
    "const root = __dirname;",
    "function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }",
    "function assert(condition, message) { if (!condition) throw new Error(message); }",
    "",
    ...expectedFiles.map((file) => `assert(fs.existsSync(path.join(root, '${escapeJs(file)}')), 'Missing ${escapeJs(file)}');`),
    "",
    "const html = read('index.html');",
    `const script = read('${escapeJs(jsFile)}');`,
    "assert(/<canvas|<main|<section|<div/i.test(html), 'HTML has no visible app container');",
    "assert(/score|\\u79ef\\u5206|\\u5206\\u6570/i.test(html + script), 'Score display or score logic not found');"
  ];

  if (shouldCheckTouch) {
    checks.push("assert(/touchstart|pointerdown|swipe|touchmove/i.test(script), 'Touch or swipe control not found');");
  }

  if (shouldCheckRestart) {
    checks.push("assert(/restart|reset|\\u91cd\\u65b0\\u5f00\\u59cb/i.test(html + script), 'Restart control not found');");
  }

  if (shouldCheckPause) {
    checks.push("assert(/pause|resume|\\u6682\\u505c|\\u7ee7\\u7eed/i.test(html + script), 'Pause or resume control not found');");
  }

  if (shouldCheckCollision) {
    checks.push("assert(/collision|gameover|game over|\\u8fb9\\u754c|\\u649e/i.test(script), 'Collision or game over logic not found');");
  }

  checks.push(
    "",
    "console.log('Static smoke test passed.');",
    ""
  );

  return checks.join("\n");
}

function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

module.exports = { enforceSmokeTestPolicy };
