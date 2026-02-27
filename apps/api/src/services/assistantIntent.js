function normalizeText(raw) {
  return String(raw || "").trim();
}

function detectIntent(rawText) {
  const text = normalizeText(rawText);
  const lower = text.toLowerCase();

  if (!lower) return { name: "help", args: {} };
  if (
    lower === "help" ||
    lower === "what can you do" ||
    lower === "what can you do?" ||
    lower === "какво можеш" ||
    lower === "какво можеш?"
  ) {
    return { name: "help", args: {} };
  }

  if (lower === "skills" || lower === "list skills" || lower === "умения" || lower === "skills?") {
    return { name: "skill.list", args: {} };
  }
  if (lower.startsWith("run skill ")) {
    return { name: "skill.run", args: { name: text.slice("run skill ".length).trim() } };
  }
  if (lower.startsWith("пусни skill ")) {
    return { name: "skill.run", args: { name: text.slice("пусни skill ".length).trim() } };
  }
  if (lower.startsWith("request skill ")) {
    return { name: "skill.request", args: { name: text.slice("request skill ".length).trim() } };
  }
  if (lower.startsWith("заяви skill ")) {
    return { name: "skill.request", args: { name: text.slice("заяви skill ".length).trim() } };
  }
  if (lower === "skill requests" || lower === "pending skills") {
    return { name: "skill.requests", args: {} };
  }
  if (lower.startsWith("approve skill ")) {
    const match = text.match(/^approve skill\s+([^\s]+)\s+for\s+(.+)$/i);
    if (match) return { name: "skill.approve", args: { name: match[1], email: match[2].trim() } };
    return { name: "skill.approve", args: { name: "", email: "" } };
  }
  if (lower.startsWith("reject skill ")) {
    const match = text.match(/^reject skill\s+([^\s]+)\s+for\s+(.+)$/i);
    if (match) return { name: "skill.reject", args: { name: match[1], email: match[2].trim() } };
    return { name: "skill.reject", args: { name: "", email: "" } };
  }

  if (lower.startsWith("remember that ")) {
    return { name: "memory.remember", args: { content: text.slice("remember that ".length).trim() } };
  }
  if (lower.startsWith("zapomni ") || lower.startsWith("запомни ")) {
    const prefix = lower.startsWith("zapomni ") ? "zapomni " : "запомни ";
    return { name: "memory.remember", args: { content: text.slice(prefix.length).trim() } };
  }
  if (lower.startsWith("forget ")) {
    return { name: "memory.forget", args: { query: text.slice("forget ".length).trim() } };
  }
  if (lower.startsWith("iztrii ") || lower.startsWith("изтрий ")) {
    const prefix = lower.startsWith("iztrii ") ? "iztrii " : "изтрий ";
    return { name: "memory.forget", args: { query: text.slice(prefix.length).trim() } };
  }
  if (lower === "what do you remember" || lower === "какво помниш" || lower === "какво помниш?") {
    return { name: "memory.list", args: {} };
  }

  if (lower.startsWith("status") || lower === "статус") {
    return { name: "status", args: {} };
  }

  if (lower.startsWith("task ")) {
    return { name: "task.create", args: { taskText: text } };
  }
  if (lower.startsWith("create task ")) {
    return { name: "task.create", args: { taskText: `task ${text.slice("create task ".length).trim()}` } };
  }
  if (lower.startsWith("създай задача ")) {
    return { name: "task.create", args: { taskText: `task ${text.slice("създай задача ".length).trim()}` } };
  }

  if (lower.startsWith("my tasks") || lower.startsWith("моите задачи")) {
    const parts = lower.split(/\s+/);
    const maybeStatus = parts[2] || "";
    return { name: "task.list", args: { status: maybeStatus } };
  }

  if (lower.startsWith("done ")) {
    const id = text.split(/\s+/)[1] || "";
    return { name: "task.done", args: { id } };
  }
  if (lower.startsWith("готово ")) {
    const id = text.split(/\s+/)[1] || "";
    return { name: "task.done", args: { id } };
  }

  if (lower.startsWith("approve ")) {
    const id = text.split(/\s+/)[1] || "";
    return { name: "task.approve", args: { id } };
  }
  if (lower.startsWith("одобри ")) {
    const id = text.split(/\s+/)[1] || "";
    return { name: "task.approve", args: { id } };
  }

  if (lower.startsWith("reject ")) {
    const parts = text.split(/\s+/);
    return { name: "task.reject", args: { id: parts[1] || "", comment: parts.slice(2).join(" ").trim() } };
  }
  if (lower.startsWith("откажи ")) {
    const parts = text.split(/\s+/);
    return { name: "task.reject", args: { id: parts[1] || "", comment: parts.slice(2).join(" ").trim() } };
  }

  return { name: "unknown", args: {} };
}

function isActionIntent(intentName) {
  return [
    "task.create",
    "task.done",
    "task.approve",
    "task.reject",
    "memory.remember",
    "memory.forget",
    "skill.run",
    "skill.request",
    "skill.approve",
    "skill.reject",
  ].includes(intentName);
}

function formatFinalReply(requestId, body) {
  const rid = String(requestId || "").slice(0, 8);
  return `[${rid}] ${body}`;
}

module.exports = {
  detectIntent,
  isActionIntent,
  formatFinalReply,
};
