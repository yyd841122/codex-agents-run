const childProcess = require("child_process");
const { isAllowedCommand } = require("../safety/command-policy");

async function runAllowedCommand({ cwd, command, yes }) {
  if (process.env.VIBE_FORCE_TEST_FAILURE === "1" && command.includes("smoke-test.js")) {
    return {
      command,
      exitCode: 1,
      stdout: "",
      stderr: "Forced test failure for fix loop verification."
    };
  }

  if (!isAllowedCommand(command)) {
    return {
      command,
      exitCode: 126,
      stdout: "",
      stderr: `Command blocked by safety policy: ${command}`
    };
  }

  if (!yes) {
    return {
      command,
      exitCode: 0,
      stdout: "Command approved automatically in MVP preview mode. Pass --yes to execute.",
      stderr: "",
      skipped: true
    };
  }

  return new Promise((resolve) => {
    childProcess.exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        command,
        exitCode: error && typeof error.code === "number" ? error.code : 0,
        stdout,
        stderr
      });
    });
  });
}

module.exports = { runAllowedCommand };
