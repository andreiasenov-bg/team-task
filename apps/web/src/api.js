const API_BASE = "http://127.0.0.1:3320/api";

async function call(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body && body.error ? body.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function callText(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text;
}

export async function login(email, password) {
  return call("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function me(token) {
  return call("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
}

export async function listProjects(token) {
  return call("/projects", { headers: { Authorization: `Bearer ${token}` } });
}

export async function listProjectMembers(token, projectId) {
  return call(`/projects/${encodeURIComponent(projectId)}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listTasks(token, projectId, filters = {}) {
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (filters.search) params.set("search", String(filters.search));
  if (filters.status) params.set("status", String(filters.status));
  if (filters.review) params.set("review", String(filters.review));
  if (filters.assigneeId) params.set("assigneeId", String(filters.assigneeId));
  if (filters.includeArchived) params.set("includeArchived", "1");
  return call(`/tasks?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createTask(token, payload) {
  return call("/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function updateTaskSchedule(token, taskId, payload) {
  return call(`/tasks/${encodeURIComponent(taskId)}/schedule`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function moveTask(token, taskId, status, position = 1000) {
  return call(`/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, position }),
  });
}

export async function reviewTask(token, taskId, decision = "approve", comment = "") {
  return call(`/tasks/${encodeURIComponent(taskId)}/review`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decision, comment }),
  });
}

export async function archiveTask(token, taskId, archived = true) {
  return call(`/tasks/${encodeURIComponent(taskId)}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ archived }),
  });
}

export async function listTaskComments(token, taskId) {
  return call(`/tasks/${encodeURIComponent(taskId)}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function addTaskComment(token, taskId, content) {
  return call(`/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
}

export async function listTaskAttachments(token, taskId) {
  return call(`/tasks/${encodeURIComponent(taskId)}/attachments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function addTaskAttachment(token, taskId, payload) {
  return call(`/tasks/${encodeURIComponent(taskId)}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteTaskAttachment(token, taskId, attachmentId) {
  return call(`/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function parseContentDispositionFileName(contentDisposition) {
  const raw = String(contentDisposition || "");
  const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const plainMatch = raw.match(/filename=\"?([^\";]+)\"?/i);
  return plainMatch && plainMatch[1] ? plainMatch[1] : "";
}

export async function downloadTaskAttachment(token, taskId, attachmentId) {
  const response = await fetch(
    `${API_BASE}/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    const message = body && body.error ? body.error : text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  const blob = await response.blob();
  const fileName = parseContentDispositionFileName(response.headers.get("Content-Disposition"));
  return { blob, fileName };
}

export async function health() {
  return call("/health");
}

export async function listActivity(token, projectId, limit = 50) {
  return call(`/activity?projectId=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(String(limit))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listNotifications(token) {
  return call("/notifications", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function markNotificationRead(token, notificationId) {
  return call(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function markAllNotificationsRead(token) {
  return call("/notifications/read-all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function clearReadNotifications(token, olderThanDays = 14) {
  return call(`/notifications/read?olderThanDays=${encodeURIComponent(String(olderThanDays))}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getNotificationPreferences(token) {
  return call("/notification-preferences", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateNotificationPreferences(token, payload) {
  return call("/notification-preferences", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function getSlaPolicy(token) {
  return call("/admin/sla-policy", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateSlaPolicy(token, payload) {
  return call("/admin/sla-policy", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function listCalendarEvents(token, projectId, fromIso, toIso) {
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (fromIso) params.set("from", fromIso);
  if (toIso) params.set("to", toIso);
  return call(`/calendar/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function downloadCalendarIcs(token, projectId, fromIso, toIso) {
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (fromIso) params.set("from", fromIso);
  if (toIso) params.set("to", toIso);
  return callText(`/calendar.ics?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listAssistantSkills(token, includeAll = false) {
  const suffix = includeAll ? "?includeAll=1" : "";
  return call(`/assistant/skills${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createAssistantSkill(token, payload) {
  return call("/assistant/skills", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function listAssistantSkillApprovals(token, status = "pending") {
  return call(`/assistant/skill-approvals?status=${encodeURIComponent(status)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function decideAssistantSkillApproval(token, approvalId, status, note = "") {
  return call(`/assistant/skill-approvals/${encodeURIComponent(approvalId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, note }),
  });
}

export async function getWhatsappMetrics(token) {
  return call("/integrations/whatsapp/metrics", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listWhatsappQueue(token, status = "", limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (limit) params.set("limit", String(limit));
  return call(`/integrations/whatsapp/queue?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function requeueWhatsappMessage(token, queueId) {
  return call(`/integrations/whatsapp/queue/${encodeURIComponent(queueId)}/requeue`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}
