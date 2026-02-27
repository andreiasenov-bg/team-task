const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { query } = require("../db");
const config = require("../config");
const { badRequest, forbidden, notFound } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { emitToProject } = require("../realtime");
const { createNotification, notifyUsers } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../notifications/types");
const { getSlaPolicy } = require("../services/slaPolicy");

const router = express.Router();

const TASK_FIELDS = `
  id, project_id, assigned_to, title, description, priority, due_date,
  recurrence_type, recurrence_interval, recurrence_weekdays, recurrence_day_of_month, recurrence_monthly_mode, recurrence_end_at,
  sla_due_at, sla_reminded_at, sla_escalated_at,
  status, position, review_status, review_comment, reviewed_at, reviewed_by,
  archived_at, archived_by, created_at, updated_at
`;
const TASK_FIELDS_SELECT = `
  t.id, t.project_id, t.assigned_to, t.title, t.description, t.priority, t.due_date,
  t.recurrence_type, t.recurrence_interval, t.recurrence_weekdays, t.recurrence_day_of_month, t.recurrence_monthly_mode, t.recurrence_end_at,
  t.sla_due_at, t.sla_reminded_at, t.sla_escalated_at,
  t.status, t.position, t.review_status, t.review_comment, t.reviewed_at, t.reviewed_by,
  t.archived_at, t.archived_by, t.created_at, t.updated_at
`;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function sanitizeFileName(value, fallback = "attachment") {
  const raw = String(value || "").trim();
  const base = path.basename(raw || fallback);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return (safe || fallback).slice(0, 180);
}

function decodeBase64Payload(payload) {
  const raw = String(payload || "").trim();
  if (!raw) throw badRequest("fileDataBase64 is required");
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  const mimeType = match ? match[1] : "";
  const base64Data = match ? match[2] : raw;
  if (!/^[a-zA-Z0-9+/=]+$/.test(base64Data)) throw badRequest("invalid base64 payload");
  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) throw badRequest("empty attachment payload");
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw badRequest(`attachment too large (max ${MAX_ATTACHMENT_BYTES} bytes)`);
  }
  return { buffer, mimeType: mimeType.slice(0, 120) };
}

function maybeDeleteLocalAttachment(fileUrl) {
  const parsed = new URL(fileUrl, config.publicBaseUrl);
  if (!parsed.pathname.startsWith("/uploads/")) return;
  const fileName = path.basename(parsed.pathname);
  if (!fileName) return;
  const abs = path.join(UPLOADS_DIR, fileName);
  try {
    fs.unlinkSync(abs);
  } catch {
    // Ignore missing/unlink errors for already-removed files.
  }
}

function resolveRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = String(req.headers.host || "").trim();
  if (host) return `${proto}://${host}`;
  return String(config.publicBaseUrl || "").replace(/\/$/, "");
}

async function canAccessProject(user, projectId) {
  if (user.role === "admin" || user.role === "manager") return true;
  const membership = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
    [projectId, user.sub]
  );
  return membership.rowCount > 0;
}

function canEmployeeAccessOwnTaskOnly(auth, task) {
  if (!auth || auth.role !== "employee") return true;
  return Boolean(task && task.assigned_to && task.assigned_to === auth.sub);
}

async function notifyDonePendingReview(task, actorId) {
  const managers = await query(
    "select id, whatsapp_phone from users where is_active = true and role in ('admin', 'manager')"
  );
  await Promise.all(
    managers.rows.map((manager) =>
      createNotification({
        userId: manager.id,
        taskId: task.id,
        type: NOTIFICATION_TYPES.TASK_DONE_PENDING_REVIEW,
        title: "Task is done and waiting for review",
        message: `Task "${task.title}" was moved to done and needs review.`,
        remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        whatsappPhone: manager.whatsapp_phone || "",
        whatsappText: `Nexus Flow: Task "${task.title}" е в Done и чака review. ID: ${task.id.slice(0, 8)}`,
        dedupeKey: `task.done.pending_review:${task.id}`,
        dedupeHours: 24,
      })
    )
  );

  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, 'task.review.requested', $3::jsonb)`,
    [actorId, task.id, JSON.stringify({ taskId: task.id })]
  );
}

async function notifyAssigneeRejected(task, reviewerId, reviewComment = "") {
  if (!task.assigned_to) return;
  const user = await query("select whatsapp_phone from users where id = $1 limit 1", [task.assigned_to]);
  await createNotification({
    userId: task.assigned_to,
    taskId: task.id,
    type: NOTIFICATION_TYPES.TASK_REVIEW_REJECTED,
    title: "Task review rejected",
    message: reviewComment
      ? `Task "${task.title}" was rejected. Comment: ${reviewComment}`
      : `Task "${task.title}" was rejected. Please revise and resubmit.`,
    remindAt: new Date().toISOString(),
    whatsappPhone: user.rows[0] ? user.rows[0].whatsapp_phone || "" : "",
    whatsappText: reviewComment
      ? `Nexus Flow: Task "${task.title}" е reject-ната. Коментар: ${reviewComment}`
      : `Nexus Flow: Task "${task.title}" е reject-ната.`,
    dedupeKey: `task.review.rejected:${task.id}`,
    dedupeHours: 12,
  });
  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, 'task.rejected', $3::jsonb)`,
    [reviewerId, task.id, JSON.stringify({ reviewComment })]
  );
}

function validateStatus(value) {
  if (!["todo", "in_progress", "done"].includes(value)) throw badRequest("invalid status");
  return value;
}

function validatePriority(value) {
  if (!["low", "medium", "high"].includes(value)) throw badRequest("invalid priority");
  return value;
}

function validatePosition(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000_000) throw badRequest("invalid position");
  return parsed;
}

function getWipLimitForStatus(status) {
  if (status === "todo") return Number(config.wipLimits.todo || 0);
  if (status === "in_progress") return Number(config.wipLimits.inProgress || 0);
  if (status === "done") return Number(config.wipLimits.done || 0);
  return 0;
}

async function checkWipLimit(projectId, status, actorId) {
  const limit = getWipLimitForStatus(status);
  if (!limit || limit <= 0) return null;

  const countRes = await query(
    "select count(*)::int as count from tasks where project_id = $1 and status = $2 and archived_at is null",
    [projectId, status]
  );
  const currentCount = countRes.rows[0] ? Number(countRes.rows[0].count || 0) : 0;
  if (currentCount < limit) return null;

  const warningMessage = `WIP limit reached for ${status}: ${currentCount}/${limit}.`;

  const managers = await query("select id from users where is_active = true and role in ('admin', 'manager')");
  await notifyUsers(
    managers.rows.map((x) => x.id),
    {
      type: NOTIFICATION_TYPES.PROJECT_WIP_LIMIT_EXCEEDED,
      title: "WIP limit warning",
      message: warningMessage,
      remindAt: new Date().toISOString(),
      whatsappText: `Nexus Flow WIP alert: ${warningMessage}`,
      dedupeKey: `project.wip.limit.exceeded:${projectId}:${status}:${limit}`,
      dedupeHours: 2,
    }
  );

  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'project', $2, 'project.wip.limit.exceeded', $3::jsonb)`,
    [actorId, projectId, JSON.stringify({ status, limit, currentCount })]
  );

  return {
    status,
    limit,
    currentCount,
    message: warningMessage,
  };
}

function weekdayFromDate(date) {
  const day = date.getUTCDay(); // 0 sunday
  const idx = day === 0 ? 6 : day - 1;
  return WEEKDAYS[idx];
}

function validateRecurrence(payload, finalDueDate) {
  const recurrenceType = String(payload.recurrenceType || "none");
  if (!["none", "daily", "weekly", "monthly"].includes(recurrenceType)) {
    throw badRequest("invalid recurrenceType");
  }

  const recurrenceIntervalRaw = payload.recurrenceInterval == null ? 1 : Number(payload.recurrenceInterval);
  if (!Number.isInteger(recurrenceIntervalRaw) || recurrenceIntervalRaw < 1 || recurrenceIntervalRaw > 365) {
    throw badRequest("invalid recurrenceInterval");
  }
  const recurrenceInterval = recurrenceIntervalRaw;

  const baseDate = finalDueDate ? new Date(finalDueDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) throw badRequest("invalid dueDate");

  let recurrenceWeekdays = [];
  if (recurrenceType === "weekly") {
    const incoming = Array.isArray(payload.recurrenceWeekdays)
      ? payload.recurrenceWeekdays.map((x) => String(x).toLowerCase())
      : [];
    recurrenceWeekdays = incoming.filter((x) => WEEKDAYS.includes(x));
    if (recurrenceWeekdays.length === 0) recurrenceWeekdays = [weekdayFromDate(baseDate)];
    recurrenceWeekdays = Array.from(new Set(recurrenceWeekdays));
  }

  let recurrenceDayOfMonth = null;
  let recurrenceMonthlyMode = "day_of_month";
  if (recurrenceType === "monthly") {
    recurrenceMonthlyMode = String(payload.recurrenceMonthlyMode || "day_of_month");
    if (!["day_of_month", "last_business_day"].includes(recurrenceMonthlyMode)) {
      throw badRequest("invalid recurrenceMonthlyMode");
    }
    const raw = payload.recurrenceDayOfMonth == null ? baseDate.getUTCDate() : Number(payload.recurrenceDayOfMonth);
    if (recurrenceMonthlyMode === "day_of_month") {
      if (!Number.isInteger(raw) || raw < 1 || raw > 31) throw badRequest("invalid recurrenceDayOfMonth");
      recurrenceDayOfMonth = raw;
    }
  }

  let recurrenceEndAt = null;
  if (payload.recurrenceEndAt) {
    const parsed = new Date(payload.recurrenceEndAt);
    if (Number.isNaN(parsed.getTime())) throw badRequest("invalid recurrenceEndAt");
    recurrenceEndAt = parsed.toISOString();
  }

  return {
    recurrenceType,
    recurrenceInterval,
    recurrenceWeekdays,
    recurrenceDayOfMonth,
    recurrenceMonthlyMode,
    recurrenceEndAt,
  };
}

router.get("/tasks", requireAuth, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    if (!projectId) throw badRequest("projectId query param is required");

    const allowed = await canAccessProject(req.auth, projectId);
    if (!allowed) throw forbidden("No access to this project");

    const includeArchived = String(req.query.includeArchived || "") === "1";
    const search = req.query.search ? String(req.query.search).trim() : "";
    const status = req.query.status ? String(req.query.status) : "";
    const review = req.query.review ? String(req.query.review) : "";
    const assigneeId = req.query.assigneeId ? String(req.query.assigneeId) : "";

    const where = ["t.project_id = $1"];
    const params = [projectId];
    if (!includeArchived) where.push("t.archived_at is null");
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(lower(t.title) like $${params.length} or lower(t.description) like $${params.length})`);
    }
    if (status && ["todo", "in_progress", "done"].includes(status)) {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }
    if (review && ["pending", "approved", "rejected"].includes(review)) {
      params.push(review);
      where.push(`t.review_status = $${params.length}`);
    }
    if (req.auth.role === "employee") {
      params.push(req.auth.sub);
      where.push(`t.assigned_to = $${params.length}`);
    } else if (assigneeId) {
      params.push(assigneeId);
      where.push(`t.assigned_to = $${params.length}`);
    }

    const result = await query(
      `select ${TASK_FIELDS_SELECT}
       from tasks t
       where ${where.join(" and ")}
       order by t.position asc, t.created_at asc`,
      params
    );
    res.json({ tasks: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks", requireAuth, async (req, res, next) => {
  try {
    const {
      projectId,
      assignedTo = null,
      title,
      description = "",
      priority = "low",
      dueDate = null,
      recurrenceType = "none",
      recurrenceInterval = 1,
      recurrenceWeekdays = [],
      recurrenceDayOfMonth = null,
      recurrenceMonthlyMode = "day_of_month",
      recurrenceEndAt = null,
      status = "todo",
      position = 1000,
    } = req.body || {};

    if (!projectId) throw badRequest("projectId is required");
    if (!title || !String(title).trim()) throw badRequest("title is required");
    const finalStatus = validateStatus(status);
    const finalPriority = validatePriority(priority);
    const finalPosition = validatePosition(position);
    const finalTitle = String(title).trim();
    let finalDueDate = dueDate;
    if (finalTitle.length > 180) throw badRequest("title too long");
    if (String(description).length > 5000) throw badRequest("description too long");
    if (dueDate) {
      const parsedDue = new Date(dueDate);
      if (Number.isNaN(parsedDue.getTime())) throw badRequest("invalid dueDate");
      finalDueDate = parsedDue.toISOString();
    }
    const recurrence = validateRecurrence(
      {
        recurrenceType,
        recurrenceInterval,
        recurrenceWeekdays,
        recurrenceDayOfMonth,
        recurrenceMonthlyMode,
        recurrenceEndAt,
      },
      finalDueDate
    );

    const allowed = await canAccessProject(req.auth, projectId);
    if (!allowed) throw forbidden("No access to this project");

    let finalAssignee = assignedTo;
    if (req.auth.role === "employee") {
      if (assignedTo && assignedTo !== req.auth.sub) throw forbidden("Employees can only assign tasks to themselves");
      finalAssignee = req.auth.sub;
    }
    if (finalAssignee) {
      const membership = await query(
        "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
        [projectId, finalAssignee]
      );
      if (membership.rowCount === 0) throw badRequest("assigned user must be a project member");
    }

    const wipWarning = await checkWipLimit(projectId, finalStatus, req.auth.sub);

    const slaPolicy = await getSlaPolicy();
    const created = await query(
      `insert into tasks (
         project_id, assigned_to, title, description, priority, due_date,
         recurrence_type, recurrence_interval, recurrence_weekdays, recurrence_day_of_month, recurrence_monthly_mode, recurrence_end_at,
         sla_due_at, status, position, review_status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, now() + ($13::text || ' hours')::interval, $14, $15, 'pending')
       returning ${TASK_FIELDS}`,
      [
        projectId,
        finalAssignee,
        finalTitle,
        String(description),
        finalPriority,
        finalDueDate,
        recurrence.recurrenceType,
        recurrence.recurrenceInterval,
        recurrence.recurrenceWeekdays,
        recurrence.recurrenceDayOfMonth,
        recurrence.recurrenceMonthlyMode,
        recurrence.recurrenceEndAt,
        Math.max(1, Number(slaPolicy.defaultHours || config.slaReminder.defaultHours || 3)),
        finalStatus,
        finalPosition,
      ]
    );
    const task = created.rows[0];

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.created', $3::jsonb)`,
      [req.auth.sub, task.id, JSON.stringify({ projectId, title: task.title, status: task.status })]
    );
    emitToProject(projectId, "task.created", { task });

    res.status(201).json({ task, wipWarning });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:taskId/status", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { status, position = 1000 } = req.body || {};
    const finalStatus = validateStatus(status);
    const finalPosition = validatePosition(position);

    const existing = await query("select id, project_id, assigned_to, status, title from tasks where id = $1 limit 1", [
      taskId,
    ]);
    const task = existing.rows[0];
    if (!task) throw notFound("Task not found");

    const allowedProject = await canAccessProject(req.auth, task.project_id);
    if (!allowedProject) throw forbidden("No access to this project");

    const isPrivileged = req.auth.role === "admin" || req.auth.role === "manager";
    if (!isPrivileged && task.assigned_to !== req.auth.sub) {
      throw forbidden("Only assignee or manager/admin can move task");
    }

    const wipWarning =
      task.status !== finalStatus ? await checkWipLimit(task.project_id, finalStatus, req.auth.sub) : null;

    const updated = await query(
      `update tasks
       set status = $1,
           position = $2,
           review_status = 'pending',
           review_comment = null,
           reviewed_at = null,
           reviewed_by = null,
           archived_at = null,
           archived_by = null,
           updated_at = now()
       where id = $3
       returning ${TASK_FIELDS}`,
      [finalStatus, finalPosition, taskId]
    );

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.moved', $3::jsonb)`,
      [req.auth.sub, taskId, JSON.stringify({ status: finalStatus, position: finalPosition })]
    );

    emitToProject(task.project_id, "task.moved", { task: updated.rows[0], actorId: req.auth.sub });
    if (finalStatus === "done") await notifyDonePendingReview(updated.rows[0], req.auth.sub);

    res.json({ task: updated.rows[0], wipWarning });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId/comments", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const taskResult = await query("select id, project_id, assigned_to from tasks where id = $1 limit 1", [taskId]);
    const task = taskResult.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (!canEmployeeAccessOwnTaskOnly(req.auth, task)) throw forbidden("Employees can access only their own task comments");

    const comments = await query(
      `select c.id, c.task_id, c.user_id, u.name as user_name, c.content, c.created_at
       from comments c
       join users u on u.id = c.user_id
       where c.task_id = $1
       order by c.created_at asc`,
      [taskId]
    );
    res.json({ comments: comments.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:taskId/comments", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) throw badRequest("content is required");
    if (String(content).trim().length > 2000) throw badRequest("comment too long");

    const taskResult = await query("select id, project_id, assigned_to from tasks where id = $1 limit 1", [taskId]);
    const task = taskResult.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (!canEmployeeAccessOwnTaskOnly(req.auth, task)) throw forbidden("Employees can comment only on their own tasks");

    const inserted = await query(
      `insert into comments (task_id, user_id, content)
       values ($1, $2, $3)
       returning id, task_id, user_id, content, created_at`,
      [taskId, req.auth.sub, String(content).trim()]
    );
    const comment = inserted.rows[0];
    const user = await query("select name from users where id = $1 limit 1", [req.auth.sub]);
    comment.user_name = user.rows[0] ? user.rows[0].name : "Unknown";

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.commented', $3::jsonb)`,
      [req.auth.sub, taskId, JSON.stringify({ preview: comment.content.slice(0, 120) })]
    );

    emitToProject(task.project_id, "comment.added", { taskId, comment });
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId/attachments", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const taskResult = await query("select id, project_id, assigned_to from tasks where id = $1 limit 1", [taskId]);
    const task = taskResult.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (!canEmployeeAccessOwnTaskOnly(req.auth, task)) throw forbidden("Employees can access only their own task attachments");

    const attachments = await query(
      `select id, task_id, file_name, file_url, mime_type, size_bytes, created_by, created_at
       from task_attachments
       where task_id = $1
       order by created_at asc`,
      [taskId]
    );
    res.json({ attachments: attachments.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:taskId/attachments", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const {
      fileName = "",
      fileUrl = "",
      mimeType = "",
      sizeBytes = null,
      fileDataBase64 = "",
      originalFileName = "",
    } = req.body || {};
    const taskResult = await query("select id, project_id, assigned_to from tasks where id = $1 limit 1", [taskId]);
    const task = taskResult.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (!canEmployeeAccessOwnTaskOnly(req.auth, task)) throw forbidden("Employees can attach files only to their own tasks");

    const trimmedUrlInput = String(fileUrl || "").trim();
    const hasBinary = Boolean(String(fileDataBase64 || "").trim());
    const hasUrl = Boolean(trimmedUrlInput);
    if (!hasBinary && !hasUrl) throw badRequest("Either fileUrl or fileDataBase64 is required");

    let finalUrl = "";
    let finalName = "";
    let finalMime = String(mimeType || "").slice(0, 120) || null;
    let finalSize = null;

    if (hasBinary) {
      const { buffer, mimeType: mimeFromData } = decodeBase64Payload(fileDataBase64);
      const sourceName = String(originalFileName || fileName || "").trim() || "attachment.bin";
      const safeName = sanitizeFileName(sourceName, "attachment.bin");
      const ext = path.extname(safeName).slice(0, 12);
      const diskName = `${Date.now()}-${randomUUID()}${ext || ".bin"}`;
      const diskPath = path.join(UPLOADS_DIR, diskName);
      fs.writeFileSync(diskPath, buffer);
      finalUrl = `${resolveRequestOrigin(req)}/uploads/${diskName}`;
      finalName = safeName;
      finalMime = finalMime || mimeFromData || "application/octet-stream";
      finalSize = buffer.length;
    } else {
      try {
        const parsed = new URL(trimmedUrlInput);
        if (!["http:", "https:"].includes(parsed.protocol)) throw badRequest("fileUrl must be http/https");
      } catch {
        throw badRequest("invalid fileUrl");
      }
      finalUrl = trimmedUrlInput;
      const derivedName = trimmedUrlInput.split("/").pop() || "attachment";
      finalName = sanitizeFileName(String(fileName || "").trim() || derivedName, "attachment");
      const parsedSize = sizeBytes == null || sizeBytes === "" ? null : Number(sizeBytes);
      if (parsedSize != null && (!Number.isInteger(parsedSize) || parsedSize < 0 || parsedSize > 1_000_000_000)) {
        throw badRequest("invalid sizeBytes");
      }
      finalSize = parsedSize;
    }

    if (finalName.length > 255) throw badRequest("fileName too long");
    const inserted = await query(
      `insert into task_attachments (task_id, file_name, file_url, mime_type, size_bytes, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, task_id, file_name, file_url, mime_type, size_bytes, created_by, created_at`,
      [taskId, finalName, finalUrl, finalMime, finalSize, req.auth.sub]
    );
    const attachment = inserted.rows[0];

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.attachment.added', $3::jsonb)`,
      [req.auth.sub, taskId, JSON.stringify({ attachmentId: attachment.id, fileName: attachment.file_name })]
    );

    emitToProject(task.project_id, "task.attachment.added", { taskId, attachment, actorId: req.auth.sub });
    res.status(201).json({ attachment });
  } catch (error) {
    next(error);
  }
});

router.delete("/tasks/:taskId/attachments/:attachmentId", requireAuth, async (req, res, next) => {
  try {
    const { taskId, attachmentId } = req.params;
    const taskResult = await query("select id, project_id, assigned_to from tasks where id = $1 limit 1", [taskId]);
    const task = taskResult.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (!canEmployeeAccessOwnTaskOnly(req.auth, task)) throw forbidden("Employees can remove attachments only on their own tasks");

    const attachmentRes = await query(
      "select id, created_by, file_url from task_attachments where id = $1 and task_id = $2 limit 1",
      [attachmentId, taskId]
    );
    const attachment = attachmentRes.rows[0];
    if (!attachment) throw notFound("Attachment not found");

    const isPrivileged = req.auth.role === "admin" || req.auth.role === "manager";
    if (!isPrivileged && attachment.created_by !== req.auth.sub) {
      throw forbidden("Only creator or manager/admin can remove attachment");
    }

    await query("delete from task_attachments where id = $1", [attachmentId]);
    try {
      maybeDeleteLocalAttachment(attachment.file_url);
    } catch {
      // Keep API delete idempotent even if local file cleanup fails.
    }
    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.attachment.removed', $3::jsonb)`,
      [req.auth.sub, taskId, JSON.stringify({ attachmentId })]
    );

    emitToProject(task.project_id, "task.attachment.removed", { taskId, attachmentId, actorId: req.auth.sub });
    res.json({ ok: true, attachmentId });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:taskId/review", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { decision = "approve", comment = "" } = req.body || {};
    if (!["admin", "manager"].includes(req.auth.role)) throw forbidden("Only admin/manager can review tasks");
    if (!["approve", "reject"].includes(String(decision))) throw badRequest("decision must be approve or reject");
    if (String(comment).length > 2000) throw badRequest("review comment too long");

    const existing = await query("select id, project_id, status from tasks where id = $1 limit 1", [taskId]);
    const task = existing.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");
    if (task.status !== "done") throw badRequest("Only done tasks can be reviewed");

    const isReject = String(decision) === "reject";
    const updated = await query(
      `update tasks
       set status = case when $1 then 'in_progress' else status end,
           review_status = case when $1 then 'rejected' else 'approved' end,
           review_comment = case when $2 <> '' then $2 else review_comment end,
           reviewed_at = now(),
           reviewed_by = $3,
           updated_at = now()
       where id = $4
       returning ${TASK_FIELDS}`,
      [isReject, String(comment).trim(), req.auth.sub, taskId]
    );

    await query(
      `update notifications
       set is_read = true
       where task_id = $1 and type in ('task.done.pending_review', 'task.review.reminder')`,
      [taskId]
    );

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, $3, $4::jsonb)`,
      [req.auth.sub, taskId, isReject ? "task.rejected" : "task.approved", JSON.stringify({ comment: String(comment) })]
    );

    if (isReject) await notifyAssigneeRejected(updated.rows[0], req.auth.sub, String(comment).trim());

    emitToProject(task.project_id, "task.reviewed", { task: updated.rows[0], actorId: req.auth.sub });
    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:taskId/archive", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { archived = true } = req.body || {};
    if (!["admin", "manager"].includes(req.auth.role)) throw forbidden("Only admin/manager can archive tasks");

    const existing = await query("select id, project_id, status, review_status from tasks where id = $1 limit 1", [taskId]);
    const task = existing.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");

    if (archived && !(task.status === "done" && task.review_status === "approved")) {
      throw badRequest("Task must be done and approved before archiving");
    }

    const updated = await query(
      `update tasks
       set archived_at = case when $1 then now() else null end,
           archived_by = case when $1 then $2::uuid else null::uuid end,
           updated_at = now()
       where id = $3
       returning ${TASK_FIELDS}`,
      [Boolean(archived), req.auth.sub, taskId]
    );

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, $3, $4::jsonb)`,
      [req.auth.sub, taskId, archived ? "task.archived" : "task.unarchived", JSON.stringify({ archived: Boolean(archived) })]
    );

    emitToProject(task.project_id, "task.archived", { task: updated.rows[0], actorId: req.auth.sub });
    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:taskId/schedule", requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const existing = await query("select id, project_id, assigned_to, due_date from tasks where id = $1 limit 1", [taskId]);
    const task = existing.rows[0];
    if (!task) throw notFound("Task not found");
    if (!(await canAccessProject(req.auth, task.project_id))) throw forbidden("No access to this project");

    const isPrivileged = req.auth.role === "admin" || req.auth.role === "manager";
    if (!isPrivileged && task.assigned_to !== req.auth.sub) {
      throw forbidden("Only assignee or manager/admin can change schedule");
    }

    let nextDueDate = task.due_date;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "dueDate")) {
      if (!req.body.dueDate) {
        nextDueDate = null;
      } else {
        const parsedDue = new Date(req.body.dueDate);
        if (Number.isNaN(parsedDue.getTime())) throw badRequest("invalid dueDate");
        nextDueDate = parsedDue.toISOString();
      }
    }

    const recurrence = validateRecurrence(req.body || {}, nextDueDate);
    const updated = await query(
      `update tasks
       set due_date = $1,
           recurrence_type = $2,
           recurrence_interval = $3,
           recurrence_weekdays = $4::text[],
           recurrence_day_of_month = $5,
           recurrence_monthly_mode = $6,
           recurrence_end_at = $7,
           updated_at = now()
       where id = $8
       returning ${TASK_FIELDS}`,
      [
        nextDueDate,
        recurrence.recurrenceType,
        recurrence.recurrenceInterval,
        recurrence.recurrenceWeekdays,
        recurrence.recurrenceDayOfMonth,
        recurrence.recurrenceMonthlyMode,
        recurrence.recurrenceEndAt,
        taskId,
      ]
    );

    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'task', $2, 'task.schedule.updated', $3::jsonb)`,
      [req.auth.sub, taskId, JSON.stringify({ dueDate: nextDueDate, ...recurrence })]
    );

    emitToProject(task.project_id, "task.schedule.updated", { task: updated.rows[0], actorId: req.auth.sub });
    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
