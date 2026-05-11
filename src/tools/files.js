const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function emptyDirInside(root, dir) {
  const resolvedRoot = path.resolve(root);
  const resolvedDir = path.resolve(root, dir);
  const relative = path.relative(resolvedRoot, resolvedDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean directory outside workspace: ${dir}`);
  }

  if (!relative.startsWith(`generated${path.sep}`) && relative !== "generated") {
    throw new Error(`Refusing to clean non-generated directory: ${dir}`);
  }

  if (!fs.existsSync(resolvedDir)) {
    ensureDir(resolvedDir);
    return [];
  }

  const removed = [];
  for (const entry of fs.readdirSync(resolvedDir)) {
    const target = path.join(resolvedDir, entry);
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}

module.exports = { ensureDir, writeText, writeJson, emptyDirInside };
