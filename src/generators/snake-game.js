const path = require("path");
const { ensureDir, writeText } = require("../tools/files");

function createSnakeGame(outputRoot) {
  ensureDir(outputRoot);
  const files = [
    write(outputRoot, "index.html", indexHtml()),
    write(outputRoot, "styles.css", stylesCss()),
    write(outputRoot, "game.js", gameJs()),
    write(outputRoot, "smoke-test.js", smokeTestJs())
  ];
  return files;
}

function write(root, name, content) {
  const fullPath = path.join(root, name);
  writeText(fullPath, content);
  return fullPath;
}

function indexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Snake Game</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main class="app">
    <section class="hud" aria-label="Game status">
      <div>
        <span class="label">Score</span>
        <strong id="score">0</strong>
      </div>
      <div>
        <span class="label">Best</span>
        <strong id="best">0</strong>
      </div>
      <button id="restart" type="button">Restart</button>
    </section>
    <canvas id="board" width="360" height="360" aria-label="Snake game board"></canvas>
    <p id="message" class="message">Press Start or swipe to play.</p>
    <button id="start" type="button" class="primary">Start</button>
  </main>
  <script src="./game.js"></script>
</body>
</html>
`;
}

function stylesCss() {
  return `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f7fb;
  color: #172033;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
}

.app {
  width: min(100vw, 430px);
  min-height: 100vh;
  padding: 20px;
  display: grid;
  align-content: center;
  gap: 14px;
}

.hud {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 10px;
}

.label {
  display: block;
  font-size: 12px;
  color: #657089;
}

strong {
  font-size: 24px;
}

button {
  min-height: 42px;
  border: 0;
  border-radius: 8px;
  padding: 0 16px;
  background: #dfe5ef;
  color: #172033;
  font-weight: 700;
}

.primary {
  background: #1d7a5f;
  color: white;
}

#board {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: #111827;
  box-shadow: 0 18px 45px rgba(23, 32, 51, 0.18);
  touch-action: none;
}

.message {
  min-height: 24px;
  margin: 0;
  text-align: center;
  color: #46536a;
}
`;
}

function gameJs() {
  return `"use strict";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const messageEl = document.getElementById("message");
const startBtn = document.getElementById("start");
const restartBtn = document.getElementById("restart");

const gridSize = 18;
const tile = canvas.width / gridSize;
const tickMs = 120;

let snake;
let food;
let direction;
let nextDirection;
let score;
let timer;
let running = false;
let touchStart = null;

const bestKey = "vibe-snake-best";
let best = Number(localStorage.getItem(bestKey) || "0");
bestEl.textContent = String(best);

function reset() {
  snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  score = 0;
  food = placeFood();
  running = false;
  scoreEl.textContent = "0";
  messageEl.textContent = "Press Start or swipe to play.";
  clearInterval(timer);
  draw();
}

function start() {
  if (running) return;
  running = true;
  messageEl.textContent = "";
  clearInterval(timer);
  timer = setInterval(tick, tickMs);
}

function tick() {
  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  if (isCollision(head)) {
    endGame();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 10;
    scoreEl.textContent = String(score);
    food = placeFood();
  } else {
    snake.pop();
  }

  draw();
}

function isCollision(cell) {
  const wall = cell.x < 0 || cell.y < 0 || cell.x >= gridSize || cell.y >= gridSize;
  const self = snake.some((part) => part.x === cell.x && part.y === cell.y);
  return wall || self;
}

function placeFood() {
  let candidate;
  do {
    candidate = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize)
    };
  } while (snake.some((part) => part.x === candidate.x && part.y === candidate.y));
  return candidate;
}

function draw() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#263348";
  for (let i = 0; i <= gridSize; i += 1) {
    ctx.fillRect(i * tile, 0, 1, canvas.height);
    ctx.fillRect(0, i * tile, canvas.width, 1);
  }

  ctx.fillStyle = "#f15b5b";
  roundRect(food.x * tile + 3, food.y * tile + 3, tile - 6, tile - 6, 5);

  snake.forEach((part, index) => {
    ctx.fillStyle = index === 0 ? "#7ee0b2" : "#2db17f";
    roundRect(part.x * tile + 2, part.y * tile + 2, tile - 4, tile - 4, 5);
  });
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function endGame() {
  clearInterval(timer);
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem(bestKey, String(best));
    bestEl.textContent = String(best);
  }
  messageEl.textContent = "Game over. Restart and try again.";
}

function setDirection(x, y) {
  const reversing = direction.x + x === 0 && direction.y + y === 0;
  if (!reversing) {
    nextDirection = { x, y };
  }
  start();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") setDirection(0, -1);
  if (event.key === "ArrowDown") setDirection(0, 1);
  if (event.key === "ArrowLeft") setDirection(-1, 0);
  if (event.key === "ArrowRight") setDirection(1, 0);
});

canvas.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
});

canvas.addEventListener("touchend", (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    setDirection(dx > 0 ? 1 : -1, 0);
  } else {
    setDirection(0, dy > 0 ? 1 : -1);
  }
});

startBtn.addEventListener("click", start);
restartBtn.addEventListener("click", reset);

reset();
`;
}

function smokeTestJs() {
  return `"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const required = ["index.html", "styles.css", "game.js"];
for (const file of required) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error("Missing generated file: " + file);
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "game.js"), "utf8");

const expectations = [
  ["canvas", html.includes("<canvas")],
  ["start button", html.includes("id=\\"start\\"")],
  ["touch controls", js.includes("touchstart") && js.includes("touchend")],
  ["collision detection", js.includes("isCollision")],
  ["score update", js.includes("score += 10")]
];

const failed = expectations.filter((item) => !item[1]).map((item) => item[0]);
if (failed.length) {
  throw new Error("Failed expectations: " + failed.join(", "));
}

console.log("Smoke test passed.");
`;
}

module.exports = { createSnakeGame };
