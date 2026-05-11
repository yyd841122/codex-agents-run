const fs = require("fs");
const path = require("path");

const defaultExtensions = new Set([".html", ".css", ".js", ".json", ".md"]);

function collectFileContext({ cwd, scopes, maxBytes = 50000 }) {
  const files = [];
  let remaining = maxBytes;

  for (const scope of scopes) {
    const root = path.resolve(cwd, scope);
    if (!fs.existsSync(root)) {
      continue;
    }

    const candidates = fs.statSync(root).isDirectory() ? walk(root) : [root];
    for (const filePath of candidates) {
      if (remaining <= 0) break;
      if (!defaultExtensions.has(path.extname(filePath))) continue;

      const content = fs.readFileSync(filePath, "utf8");
      const clipped = content.slice(0, remaining);
      remaining -= Buffer.byteLength(clipped, "utf8");
      files.push({
        path: path.relative(cwd, filePath),
        content: clipped,
        truncated: clipped.length < content.length
      });
    }
  }

  return files;
}

function walk(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(fullPath));
    } else {
      found.push(fullPath);
    }
  }
  return found;
}

module.exports = { collectFileContext };
