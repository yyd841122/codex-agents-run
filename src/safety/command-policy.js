const allowedPrefixes = [
  /^node\s+generated[\\/][a-z0-9-]+[\\/]smoke-test\.js$/i,
  /^npm\s+test$/i,
  /^npm\s+run\s+[a-z0-9:-]+$/i
];

const blockedFragments = [
  " rm ",
  " del ",
  " rmdir ",
  "Remove-Item",
  "format ",
  "shutdown",
  "curl ",
  "wget ",
  "Invoke-WebRequest"
];

function isAllowedCommand(command) {
  if (!command || typeof command !== "string") return false;
  const padded = ` ${command} `;
  if (blockedFragments.some((fragment) => padded.includes(fragment))) {
    return false;
  }
  return allowedPrefixes.some((pattern) => pattern.test(command.trim()));
}

module.exports = { isAllowedCommand };
