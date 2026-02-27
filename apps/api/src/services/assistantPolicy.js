const ALLOWED_INTENTS_BY_ROLE = {
  admin: new Set([
    "help",
    "status",
    "task.create",
    "task.list",
    "task.done",
    "task.approve",
    "task.reject",
    "memory.remember",
    "memory.forget",
    "memory.list",
    "skill.list",
    "skill.run",
    "skill.request",
    "skill.approve",
    "skill.reject",
    "skill.requests",
  ]),
  manager: new Set([
    "help",
    "status",
    "task.create",
    "task.list",
    "task.done",
    "task.approve",
    "task.reject",
    "memory.remember",
    "memory.forget",
    "memory.list",
    "skill.list",
    "skill.run",
    "skill.request",
    "skill.approve",
    "skill.reject",
    "skill.requests",
  ]),
  employee: new Set([
    "help",
    "status",
    "task.create",
    "task.list",
    "task.done",
    "memory.remember",
    "memory.forget",
    "memory.list",
    "skill.list",
    "skill.run",
    "skill.request",
  ]),
};

function isRestrictedPrompt(text) {
  const lower = String(text || "").toLowerCase();
  const blocked = [
    "rm ",
    "delete file",
    "open browser",
    "gmail",
    "ssh ",
    "terminal command",
    "run shell",
    "execute command",
  ];
  return blocked.some((x) => lower.includes(x));
}

function isIntentAllowed(role, intentName) {
  const allowed = ALLOWED_INTENTS_BY_ROLE[String(role || "").toLowerCase()];
  if (!allowed) return false;
  return allowed.has(intentName);
}

module.exports = {
  isRestrictedPrompt,
  isIntentAllowed,
};
