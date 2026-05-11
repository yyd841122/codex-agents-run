const childProcess = require("child_process");
const path = require("path");

function captureGitSnapshot(cwd) {
  if (!isGitRepo(cwd)) {
    return {
      isGitRepo: false,
      status: "",
      diffStat: ""
    };
  }

  return {
    isGitRepo: true,
    status: runGit(cwd, ["status", "--short"]),
    diffStat: runGit(cwd, ["diff", "--stat"])
  };
}

function createGitCheckpoint({ cwd, message, paths = [], push = false }) {
  if (!isGitRepo(cwd)) {
    return {
      status: "skipped",
      summary: "Not a Git repository."
    };
  }

  const addablePaths = paths
    .map((item) => path.resolve(cwd, item))
    .filter((item) => isInside(cwd, item))
    .map((item) => path.relative(cwd, item))
    .filter((item) => item && !isGitIgnored(cwd, item));

  if (!addablePaths.length) {
    return {
      status: "skipped",
      summary: "No Git-trackable paths were provided for checkpoint."
    };
  }

  const add = runGitDetailed(cwd, ["add", "--", ...addablePaths]);
  if (add.status !== 0) {
    return {
      status: "failed",
      summary: add.output || "git add failed."
    };
  }

  const staged = childProcess.spawnSync("git", ["diff", "--cached", "--quiet", "--", ...addablePaths], {
    cwd,
    encoding: "utf8"
  });

  if (staged.status === 0) {
    return {
      status: "skipped",
      summary: "No staged changes to checkpoint."
    };
  }

  const commit = runGitDetailed(cwd, ["commit", "-m", message, "--", ...addablePaths]);
  if (commit.status !== 0) {
    return {
      status: "failed",
      summary: commit.output || "git commit failed."
    };
  }

  const hash = runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  const result = {
    status: "completed",
    commit: hash,
    summary: `Created Git checkpoint ${hash}.`,
    pushed: false
  };

  if (push) {
    const pushResult = runGitDetailed(cwd, ["push"]);
    result.pushed = pushResult.status === 0;
    result.pushOutput = pushResult.output;
    if (pushResult.status !== 0) {
      result.status = "failed";
      result.summary = `Created checkpoint ${hash}, but git push failed.`;
    }
  }

  return result;
}

function isGitRepo(cwd) {
  const result = childProcess.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

function runGit(cwd, args) {
  const result = childProcess.spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  return [
    result.stdout || "",
    result.stderr || ""
  ].join("").trim();
}

function runGitDetailed(cwd, args) {
  const result = childProcess.spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  return {
    status: result.status,
    output: [
      result.stdout || "",
      result.stderr || ""
    ].join("").trim()
  };
}

function isGitIgnored(cwd, item) {
  const result = childProcess.spawnSync("git", ["check-ignore", "-q", item], {
    cwd,
    encoding: "utf8"
  });
  return result.status === 0;
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

module.exports = { captureGitSnapshot, createGitCheckpoint };
