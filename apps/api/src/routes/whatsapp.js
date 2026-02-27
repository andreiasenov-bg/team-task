const express = require("express");
const config = require("../config");
const { query } = require("../db");
const { badRequest, forbidden, notFound } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { emitToProject } = require("../realtime");
const {
  normalizePhone,
  findUserByWhatsappPhone,
  sendTextMessageWithRetry,
  isReady,
} = require("../integrations/whatsapp");
const { isTranscriptionReady, transcribeAudioBuffer } = require("../integrations/transcription");
const { createNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../notifications/types");
const { detectIntent, isActionIntent, formatFinalReply } = require("../services/assistantIntent");
const { isRestrictedPrompt, isIntentAllowed } = require("../services/assistantPolicy");
const { getSlaPolicy } = require("../services/slaPolicy");
const {
  listSkillsForUser,
  runAnySkill,
  requestSkillAccess,
  decideSkillAccess,
  listPendingSkillRequests,
} = require("../services/assistantSkills");

const router = express.Router();

async function canAccessProject(user, projectId) {
  if (user.role === "admin" || user.role === "manager") return true;
  const membership = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
    [projectId, user.id]
  );
  return membership.rowCount > 0;
}

async function resolveDefaultProjectId(user) {
  const result = await query(
    `select p.id
     from projects p
     left join project_members pm on pm.project_id = p.id
     where p.archived = false
       and (pm.user_id = $1 or p.owner_id = $1 or $2 in ('admin', 'manager'))
     order by p.created_at desc
     limit 1`,
    [user.id, user.role]
  );
  return result.rows[0] ? result.rows[0].id : null;
}

function parseTaskCommand(rawText) {
  const raw = String(rawText || "").trim();
  let text = raw.replace(/^task\s+/i, "").trim();
  if (!text) return { error: "Липсва текст за задача. Пример: task @ivan Оправи login due:2026-03-01 prio:high" };

  let assigneeHint = "";
  const assigneeMatch = text.match(/@([\p{L}\p{N}._-]+)/u);
  if (assigneeMatch) {
    assigneeHint = assigneeMatch[1];
    text = text.replace(assigneeMatch[0], "").trim();
  }

  let priority = "medium";
  const prioMatch = text.match(/prio:(low|medium|high)/i);
  if (prioMatch) {
    priority = String(prioMatch[1]).toLowerCase();
    text = text.replace(prioMatch[0], "").trim();
  }

  let status = "todo";
  const statusMatch = text.match(/status:(todo|in_progress|done)/i);
  if (statusMatch) {
    status = String(statusMatch[1]).toLowerCase();
    text = text.replace(statusMatch[0], "").trim();
  }

  let dueDate = null;
  const dueMatch = text.match(/due:(\d{4}-\d{2}-\d{2})/i);
  if (dueMatch) {
    dueDate = `${dueMatch[1]}T09:00:00.000Z`;
    text = text.replace(dueMatch[0], "").trim();
  }

  const title = text.trim();
  if (!title) return { error: "Липсва заглавие за задачата." };
  return { title, assigneeHint, priority, status, dueDate };
}

async function resolveAssignee(projectId, hint) {
  if (!hint) return null;
  const exact = await query(
    `select u.id, u.name
     from users u
     join project_members pm on pm.user_id = u.id and pm.project_id = $1
     where lower(u.name) = lower($2)
     limit 1`,
    [projectId, hint]
  );
  if (exact.rowCount > 0) return exact.rows[0];

  const fuzzy = await query(
    `select u.id, u.name
     from users u
     join project_members pm on pm.user_id = u.id and pm.project_id = $1
     where lower(u.name) like lower($2) or lower(split_part(u.email, '@', 1)) like lower($2)
     limit 2`,
    [projectId, `${hint}%`]
  );
  if (fuzzy.rowCount === 1) return fuzzy.rows[0];
  return null;
}

async function createTaskFromWhatsapp(user, incomingText) {
  const parsed = parseTaskCommand(incomingText);
  if (parsed.error) return parsed.error;

  const projectId = await resolveDefaultProjectId(user);
  if (!projectId) return "Няма намерен активен проект за създаване на задача.";
  if (!(await canAccessProject(user, projectId))) return "Нямаш достъп до този проект.";

  let assigneeId = user.id;
  let assigneeName = user.name;
  if (parsed.assigneeHint) {
    const resolved = await resolveAssignee(projectId, parsed.assigneeHint);
    if (!resolved) return `Не намерих @${parsed.assigneeHint} в проекта.`;
    assigneeId = resolved.id;
    assigneeName = resolved.name;
  }
  if (user.role === "employee" && assigneeId !== user.id) {
    return "Като служител можеш да създаваш само задачи към себе си.";
  }

  const slaPolicy = await getSlaPolicy();
  const inserted = await query(
    `insert into tasks (
       project_id, assigned_to, title, description, priority, due_date,
       status, position, review_status, sla_due_at
     )
     values ($1, $2, $3, '', $4, $5, $6, 1000, 'pending', now() + ($7::text || ' hours')::interval)
     returning id, title, status`,
    [
      projectId,
      assigneeId,
      parsed.title,
      parsed.priority,
      parsed.dueDate,
      parsed.status,
      Math.max(1, Number(slaPolicy.defaultHours || config.slaReminder.defaultHours || 3)),
    ]
  );
  const task = inserted.rows[0];

  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, 'task.created', $3::jsonb)`,
    [user.id, task.id, JSON.stringify({ source: "whatsapp", projectId, title: task.title, status: task.status })]
  );
  emitToProject(projectId, "task.created", { task, actorId: user.id });

  return `Task created: ${task.title}\nID: ${task.id.slice(0, 8)}\nAssignee: ${assigneeName}\nStatus: ${task.status}`;
}

async function downloadWhatsappAudioByMediaId(mediaId) {
  const mediaMetaResponse = await fetch(
    `https://graph.facebook.com/${config.whatsapp.graphVersion}/${encodeURIComponent(mediaId)}`,
    {
      headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
    }
  );
  if (!mediaMetaResponse.ok) throw new Error("media_meta_failed");
  const mediaMeta = await mediaMetaResponse.json();
  if (!mediaMeta || !mediaMeta.url) throw new Error("media_url_missing");

  const mediaContentResponse = await fetch(mediaMeta.url, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
  });
  if (!mediaContentResponse.ok) throw new Error("media_download_failed");

  const mimeType = mediaContentResponse.headers.get("content-type") || "audio/ogg";
  const arrayBuffer = await mediaContentResponse.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

async function formatMyTasks(user, status = "") {
  const params = [user.id];
  let where = "assigned_to = $1 and archived_at is null";
  if (status && ["todo", "in_progress", "done"].includes(status)) {
    params.push(status);
    where += ` and status = $${params.length}`;
  }
  const result = await query(
    `select id, title, status, priority, due_date
     from tasks
     where ${where}
     order by
       case when due_date is null then 1 else 0 end,
       due_date asc,
       created_at desc
     limit 10`,
    params
  );
  if (result.rowCount === 0) return "Нямаш активни задачи по този филтър.";
  const lines = result.rows.map((t) => {
    const due = t.due_date ? `, due ${new Date(t.due_date).toLocaleDateString("bg-BG")}` : "";
    return `• ${t.id.slice(0, 8)} | ${t.title} [${t.status}]${due}`;
  });
  return `Твоите задачи:\n${lines.join("\n")}`;
}

async function notifyDonePendingReview(task, actorId) {
  const managers = await query("select id, whatsapp_phone from users where is_active = true and role in ('admin', 'manager')");
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
        whatsappText: `listO: Task "${task.title}" е в Done и чака review. ID: ${task.id.slice(0, 8)}`,
        dedupeKey: `task.done.pending_review:${task.id}`,
        dedupeHours: 24,
      })
    )
  );
  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, 'task.review.requested', $3::jsonb)`,
    [actorId, task.id, JSON.stringify({ source: "whatsapp" })]
  );
}

async function approveOrRejectFromWhatsapp(user, taskShortId, decision, comment = "") {
  if (!["admin", "manager"].includes(user.role)) {
    return "Нямаш права за approve/reject. Трябва да си admin/manager.";
  }
  const taskResult = await query(
    `select id, project_id, title, status
     from tasks
     where id::text like $1 || '%'
     limit 2`,
    [taskShortId]
  );
  if (taskResult.rowCount === 0) return "Не намерих задача с този id.";
  if (taskResult.rowCount > 1) return "ID е нееднозначен. Използвай повече символи.";

  const task = taskResult.rows[0];
  if (!(await canAccessProject(user, task.project_id))) return "Нямаш достъп до този проект.";
  if (task.status !== "done") return "Само задачи в Done могат да се ревюират.";

  const isReject = decision === "reject";
  const updated = await query(
    `update tasks
     set status = case when $1 then 'in_progress' else status end,
         review_status = case when $1 then 'rejected' else 'approved' end,
         review_comment = case when $2 <> '' then $2 else review_comment end,
         reviewed_at = now(),
         reviewed_by = $3,
         updated_at = now()
     where id = $4
     returning id, project_id, title, review_status, status`,
    [isReject, comment, user.id, task.id]
  );
  const row = updated.rows[0];

  await query(
    `update notifications
     set is_read = true
     where task_id = $1 and type in ('task.done.pending_review', 'task.review.reminder')`,
    [task.id]
  );
  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, $3, $4::jsonb)`,
    [user.id, task.id, isReject ? "task.rejected" : "task.approved", JSON.stringify({ comment, source: "whatsapp" })]
  );
  emitToProject(row.project_id, "task.reviewed", { task: row, actorId: user.id });
  return isReject ? `Задачата е reject-ната: ${row.title}` : `Задачата е approve-ната: ${row.title}`;
}

async function moveDoneFromWhatsapp(user, taskShortId) {
  const taskResult = await query(
    `select id, project_id, title, assigned_to
     from tasks
     where id::text like $1 || '%'
     limit 2`,
    [taskShortId]
  );
  if (taskResult.rowCount === 0) return "Не намерих задача с този id.";
  if (taskResult.rowCount > 1) return "ID е нееднозначен. Използвай повече символи.";

  const task = taskResult.rows[0];
  if (!(await canAccessProject(user, task.project_id))) return "Нямаш достъп до този проект.";
  if (!["admin", "manager"].includes(user.role) && task.assigned_to !== user.id) {
    return "Можеш да местиш само свои задачи.";
  }

  const updated = await query(
    `update tasks
     set status = 'done',
         review_status = 'pending',
         review_comment = null,
         reviewed_at = null,
         reviewed_by = null,
         archived_at = null,
         archived_by = null,
         updated_at = now()
     where id = $1
     returning id, project_id, title, status`,
    [task.id]
  );
  const row = updated.rows[0];
  await query(
    `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
     values ($1, 'task', $2, 'task.moved', $3::jsonb)`,
    [user.id, task.id, JSON.stringify({ status: "done", source: "whatsapp" })]
  );
  emitToProject(row.project_id, "task.moved", { task: row, actorId: user.id });
  await notifyDonePendingReview(row, user.id);
  return `Задачата е преместена в Done: ${row.title}`;
}

async function getStatusSummary(user) {
  const tasksRes = await query(
    `select
       count(*) filter (where archived_at is null and status <> 'done')::int as open_count,
       count(*) filter (where archived_at is null and status = 'in_progress')::int as in_progress_count,
       count(*) filter (where archived_at is null and status = 'done' and review_status = 'pending')::int as pending_review_count
     from tasks
     where assigned_to = $1 or $2 in ('admin', 'manager')`,
    [user.id, user.role]
  );
  const x = tasksRes.rows[0] || { open_count: 0, in_progress_count: 0, pending_review_count: 0 };
  return `Status:\nOpen: ${x.open_count}\nIn progress: ${x.in_progress_count}\nPending review: ${x.pending_review_count}`;
}

async function rememberFact(user, content) {
  const text = String(content || "").trim();
  if (!text) return "Липсва текст за запомняне. Пример: remember that Server deploy is Fridays.";
  if (text.length > 1000) return "Текстът е твърде дълъг (макс 1000 символа).";
  await query(
    `insert into assistant_memories (user_id, content)
     values ($1, $2)`,
    [user.id, text]
  );
  return `Запомних: "${text.slice(0, 180)}"`;
}

async function forgetFact(user, search) {
  const q = String(search || "").trim();
  if (!q) return "Липсва какво да изтрия. Пример: forget Fridays";
  const deleted = await query(
    `delete from assistant_memories
     where id in (
       select id
       from assistant_memories
       where user_id = $1
         and lower(content) like lower($2)
       order by created_at desc
       limit 1
     )
     returning id`,
    [user.id, `%${q}%`]
  );
  if (deleted.rowCount === 0) return "Не намерих такъв memory запис.";
  return "Изтрих записа от паметта.";
}

async function listMemories(user) {
  const result = await query(
    `select content, created_at
     from assistant_memories
     where user_id = $1
     order by created_at desc
     limit 10`,
    [user.id]
  );
  if (result.rowCount === 0) return "Нямам запомнени неща за теб.";
  const lines = result.rows.map((row, i) => `${i + 1}. ${row.content}`);
  return `Помня:\n${lines.join("\n")}`;
}

async function handleCommand(user, incomingText) {
  const text = String(incomingText || "").trim();
  if (isRestrictedPrompt(text)) {
    return {
      intent: "blocked",
      text: "Тази заявка е блокирана от safety policy. Позволени са само task/notification команди.",
    };
  }
  const intent = detectIntent(text);
  if (intent.name !== "unknown" && !isIntentAllowed(user.role, intent.name)) {
    return {
      intent: "forbidden",
      text: `Нямаш права за команда "${intent.name}" с роля ${user.role}.`,
    };
  }

  if (intent.name === "help") {
    const skills = await listSkillsForUser(user);
    return {
      intent: intent.name,
      text: [
        "Команди:",
      "• task @user Title due:YYYY-MM-DD prio:low|medium|high",
      "• създай задача @user Title due:YYYY-MM-DD prio:high",
      "• my tasks [todo|in_progress|done]",
      "• done <taskIdPrefix>",
      "• approve <taskIdPrefix>",
      "• reject <taskIdPrefix> [comment]",
      "• status",
        "• remember that <text>",
        "• forget <text>",
        "• what do you remember",
        "• skills",
        "• run skill <name>",
        "• request skill <name>",
        "• skill requests",
        "• approve skill <name> for <email>",
        "• reject skill <name> for <email>",
        "",
        "Skills:",
        ...skills.map((s) => `• ${s.key} - ${s.description}`),
        "• help",
      ].join("\n"),
    };
  }

  if (intent.name === "task.create") {
    return { intent: intent.name, text: await createTaskFromWhatsapp(user, intent.args.taskText || text) };
  }

  if (intent.name === "task.list") {
    return { intent: intent.name, text: await formatMyTasks(user, intent.args.status || "") };
  }

  if (intent.name === "task.done") {
    if (!intent.args.id) return { intent: intent.name, text: "Липсва task id. Пример: done 50e18499" };
    return { intent: intent.name, text: await moveDoneFromWhatsapp(user, intent.args.id) };
  }

  if (intent.name === "task.approve") {
    if (!intent.args.id) return { intent: intent.name, text: "Липсва task id. Пример: approve 50e18499" };
    return { intent: intent.name, text: await approveOrRejectFromWhatsapp(user, intent.args.id, "approve", "") };
  }

  if (intent.name === "task.reject") {
    if (!intent.args.id) return { intent: intent.name, text: "Липсва task id. Пример: reject 50e18499 нужна е корекция" };
    return {
      intent: intent.name,
      text: await approveOrRejectFromWhatsapp(user, intent.args.id, "reject", intent.args.comment || ""),
    };
  }

  if (intent.name === "status") {
    return { intent: intent.name, text: await getStatusSummary(user) };
  }

  if (intent.name === "memory.remember") {
    return { intent: intent.name, text: await rememberFact(user, intent.args.content || "") };
  }

  if (intent.name === "memory.forget") {
    return { intent: intent.name, text: await forgetFact(user, intent.args.query || "") };
  }

  if (intent.name === "memory.list") {
    return { intent: intent.name, text: await listMemories(user) };
  }

  if (intent.name === "skill.list") {
    const skills = await listSkillsForUser(user);
    if (skills.length === 0) return { intent: intent.name, text: "Няма налични skills за твоята роля." };
    return {
      intent: intent.name,
      text: ["Available skills:", ...skills.map((s) => `• ${s.key} - ${s.description}`)].join("\n"),
    };
  }

  if (intent.name === "skill.run") {
    const name = intent.args.name || "";
    if (!name) return { intent: intent.name, text: "Липсва skill име. Пример: run skill my-open-tasks" };
    const result = await runAnySkill(user, name);
    if (!result.ok) return { intent: intent.name, text: result.error };
    return { intent: intent.name, text: result.output };
  }

  if (intent.name === "skill.request") {
    const name = intent.args.name || "";
    if (!name) return { intent: intent.name, text: "Липсва skill име. Пример: request skill overdue-mine" };
    const result = await requestSkillAccess(user, name);
    return { intent: intent.name, text: result.ok ? result.message : result.error };
  }

  if (intent.name === "skill.requests") {
    if (!["admin", "manager"].includes(user.role)) {
      return { intent: intent.name, text: "Нямаш права за skill requests." };
    }
    return { intent: intent.name, text: await listPendingSkillRequests() };
  }

  if (intent.name === "skill.approve") {
    if (!intent.args.name || !intent.args.email) {
      return { intent: intent.name, text: "Пример: approve skill overdue-mine for ivan@nexus-flow.local" };
    }
    const result = await decideSkillAccess(user, intent.args.name, intent.args.email, "approve");
    return { intent: intent.name, text: result.ok ? result.message : result.error };
  }

  if (intent.name === "skill.reject") {
    if (!intent.args.name || !intent.args.email) {
      return { intent: intent.name, text: "Пример: reject skill overdue-mine for ivan@nexus-flow.local" };
    }
    const result = await decideSkillAccess(user, intent.args.name, intent.args.email, "reject");
    return { intent: intent.name, text: result.ok ? result.message : result.error };
  }

  return { intent: "unknown", text: "Неразпозната команда. Прати `help` за списък." };
}

async function registerInboundMessage(message) {
  const externalMessageId = message && message.id ? String(message.id) : "";
  if (!externalMessageId) return true;
  const inserted = await query(
    `insert into inbound_webhook_messages (provider, external_message_id, payload_json, processed_at)
     values ('whatsapp', $1, $2::jsonb, now())
     on conflict (provider, external_message_id) do nothing
     returning id`,
    [externalMessageId, JSON.stringify(message || {})]
  );
  return inserted.rowCount > 0;
}

router.patch("/integrations/whatsapp/link", requireAuth, async (req, res, next) => {
  try {
    const phone = req.body && req.body.phone ? normalizePhone(req.body.phone) : null;
    if (phone && phone.length < 7) throw badRequest("invalid phone");
    const updated = await query(
      `update users
       set whatsapp_phone = $1
       where id = $2
       returning id, name, email, role, whatsapp_phone`,
      [phone, req.auth.sub]
    );
    res.json({ user: updated.rows[0] });
  } catch (error) {
    if (String(error.code) === "23505") return next(badRequest("phone already linked to another account"));
    next(error);
  }
});

router.get("/integrations/whatsapp/metrics", requireAuth, async (req, res, next) => {
  try {
    if (!["admin", "manager"].includes(req.auth.role)) throw forbidden("Only admin/manager can view assistant metrics");
    const intents24h = await query(
      `select coalesce(meta_json->>'intent', 'unknown') as intent, count(*)::int as count
       from activity_logs
       where action = 'whatsapp.command.received'
         and created_at >= now() - interval '24 hours'
       group by 1
       order by count desc`
    );
    const inbound24h = await query(
      `select count(*)::int as count
       from inbound_webhook_messages
       where provider = 'whatsapp'
         and processed_at >= now() - interval '24 hours'`
    );
    const queue = await query(
      `select
         count(*) filter (where status='pending')::int as pending_count,
         count(*) filter (where status='failed')::int as failed_count,
         count(*) filter (where status='sent')::int as sent_count
       from outbound_message_queue
       where channel = 'whatsapp'`
    );
    const slaOps24h = await query(
      `select
         count(*) filter (where action = 'task.sla.reminder.sent')::int as reminders_sent,
         count(*) filter (where action = 'task.sla.escalated')::int as escalations_sent
       from activity_logs
       where created_at >= now() - interval '24 hours'`
    );
    res.json({
      metrics: {
        intents24h: intents24h.rows,
        inbound24h: inbound24h.rows[0] || { count: 0 },
        outboundQueue: queue.rows[0] || { pending_count: 0, failed_count: 0, sent_count: 0 },
        slaOps24h: slaOps24h.rows[0] || { reminders_sent: 0, escalations_sent: 0 },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/integrations/whatsapp/queue", requireAuth, async (req, res, next) => {
  try {
    if (!["admin", "manager"].includes(req.auth.role)) throw forbidden("Only admin/manager can view WhatsApp queue");
    const status = req.query && req.query.status ? String(req.query.status) : "";
    const limitRaw = req.query && req.query.limit ? Number(req.query.limit) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.round(limitRaw))) : 50;
    const allowed = ["pending", "sent", "failed"];
    const params = [];
    let where = "where channel = 'whatsapp'";
    if (status && allowed.includes(status)) {
      params.push(status);
      where += ` and status = $${params.length}`;
    }
    params.push(limit);
    const rows = await query(
      `select id, recipient, status, attempts, max_attempts, last_error, next_attempt_at, sent_at, created_at, updated_at
       from outbound_message_queue
       ${where}
       order by coalesce(sent_at, next_attempt_at, updated_at) desc
       limit $${params.length}`,
      params
    );
    res.json({ queue: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/integrations/whatsapp/queue/:queueId/requeue", requireAuth, async (req, res, next) => {
  try {
    if (!["admin", "manager"].includes(req.auth.role)) throw forbidden("Only admin/manager can requeue messages");
    const { queueId } = req.params;
    const updated = await query(
      `update outbound_message_queue
       set status = 'pending',
           next_attempt_at = now(),
           updated_at = now()
       where id = $1
         and channel = 'whatsapp'
       returning id, status, attempts, max_attempts, next_attempt_at`,
      [queueId]
    );
    if (updated.rowCount === 0) throw notFound("Queue item not found");
    res.json({ item: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/integrations/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge || "");
  }
  return res.status(403).json({ error: "verification failed" });
});

router.post("/integrations/whatsapp/webhook", async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body && req.body.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry && entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change && change.value ? change.value : {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const from = message.from;
          const isFreshInbound = await registerInboundMessage(message);
          if (!isFreshInbound) {
            continue;
          }
          const user = await findUserByWhatsappPhone(from);
          if (!user) {
            await sendTextMessageWithRetry(
              from,
              "Този номер не е свързан с listO акаунт. Свържи номер през профил или API endpoint /api/integrations/whatsapp/link."
            );
            continue;
          }

          if (message.type === "text") {
            const text = message.text && message.text.body ? message.text.body : "";
            const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            const parsed = detectIntent(text);
            if (isActionIntent(parsed.name)) {
              await sendTextMessageWithRetry(from, formatFinalReply(requestId, "⏳ Working on it..."));
            }
            const response = await handleCommand(user, text);
            const responseText = formatFinalReply(requestId, response.text);
            await query(
              `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
               values ($1, 'integration', null, 'whatsapp.command.received', $2::jsonb)`,
              [user.id, JSON.stringify({ channel: "text", command: text.slice(0, 300), intent: response.intent, requestId })]
            );
            await sendTextMessageWithRetry(from, responseText);
            continue;
          }

          if (message.type === "audio") {
            if (!isTranscriptionReady()) {
              await sendTextMessageWithRetry(from, "Voice commands are not configured yet.");
              continue;
            }

            let commandText = "";
            if (config.transcription.dryRun && message.audio && message.audio.mock_text) {
              commandText = String(message.audio.mock_text);
            } else {
              const mediaId = message.audio && message.audio.id ? String(message.audio.id) : "";
              if (!mediaId) {
                await sendTextMessageWithRetry(from, "Липсва audio media id.");
                continue;
              }
              const media = await downloadWhatsappAudioByMediaId(mediaId);
              const transcript = await transcribeAudioBuffer(media.buffer, media.mimeType, "voice-note.ogg");
              if (!transcript.ok) {
                await sendTextMessageWithRetry(from, "Не успях да разпозная voice message-а.");
                continue;
              }
              commandText = transcript.text;
            }

            const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            const parsed = detectIntent(commandText);
            if (isActionIntent(parsed.name)) {
              await sendTextMessageWithRetry(from, formatFinalReply(requestId, "⏳ Working on your voice command..."));
            }
            const response = await handleCommand(user, commandText);
            const responseText = formatFinalReply(requestId, response.text);
            await query(
              `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
               values ($1, 'integration', null, 'whatsapp.command.received', $2::jsonb)`,
              [user.id, JSON.stringify({ channel: "audio", command: String(commandText).slice(0, 300), intent: response.intent, requestId })]
            );
            await sendTextMessageWithRetry(from, `Voice command: ${commandText}\n\n${responseText}`);
          }
        }
      }
    }
    res.json({ ok: true, ready: isReady() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
