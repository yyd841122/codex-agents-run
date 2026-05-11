const childProcess = require("child_process");

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

module.exports = { captureGitSnapshot };
