const allowedPrefixes = [
  /^node\s+generated[\\/][a-z0-9-]+[\\/]smoke-test\.js$/i,
  /^npm\s+test$/i,
  /^npm\s+run\s+[a-z0-9:-]+$/i,
  /^cd\s+\.{1,2}$/i,
  /^cd\s+[a-z0-9._ \-\\/]+$/i,
  /^git\s+status(?:\s+--short)?$/i,
  /^git\s+add\s+(?:\.|[a-z0-9._ \-\\/]+(?:\s+[a-z0-9._ \-\\/]+)*)$/i,
  /^git\s+commit\s+-m\s+"[a-z0-9 .,_:()\\/-]+"$/i,
  /^git\s+commit\s+-m\s+'[a-z0-9 .,_:()\\/-]+'$/i,
  /^git\s+push(?:\s+[a-z0-9._-]+(?:\s+[a-z0-9._\\/-]+)?)?$/i
];

const blockedFragments = [
  "&&",
  "||",
  ";",
  "|",
  ">",
  "<",
  "`",
  "$(",
  " rm ",
  " del ",
  " rmdir ",
  "Remove-Item",
  "format ",
  "shutdown",
  "curl ",
  "wget ",
  "Invoke-WebRequest",
  "--force",
  "-f "
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
