const { query } = require("../db");
const { createNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../notifications/types");
const { getSlaPolicy } = require("../services/slaPolicy");

let timer = null;
let running = false;
let lastRunAt = 0;

function taskInfoText(task) {
  const desc = String(task.description || "").trim();
  const short = desc.length > 280 ? `${desc.slice(0, 277)}...` : desc;
  return short || "No details provided.";
}

async function runSlaScan(policyInput = null) {
  if (running) return;
  running = true;
  try {
    const policy = policyInput || (await getSlaPolicy());
    if (!policy.enabled) return;
    const reminderRepeatHours = Math.max(1, Number(policy.repeatHours || policy.defaultHours || 3));
    const maxReminders = Math.max(1, Number(policy.maxReminders || 6));
    const overdue = await query(
      `select t.id, t.project_id, t.assigned_to, t.title, t.description, t.sla_due_at,
              t.sla_reminded_at, t.sla_last_reminded_at, t.sla_reminder_count,
              u.name as assignee_name, u.whatsapp_phone
       from tasks t
       join users u on u.id = t.assigned_to
       where t.assigned_to is not null
         and t.archived_at is null
         and t.status <> 'done'
         and t.sla_due_at is not null
         and t.sla_due_at <= now()
         and coalesce(t.sla_reminder_count, 0) < $1
         and (
           coalesce(t.sla_last_reminded_at, t.sla_reminded_at) is null
           or coalesce(t.sla_last_reminded_at, t.sla_reminded_at) <= now() - make_interval(hours => $2)
         )
       order by coalesce(t.sla_last_reminded_at, t.sla_reminded_at, t.sla_due_at) asc
       limit 200`,
      [maxReminders, reminderRepeatHours]
    );

    for (const task of overdue.rows) {
      const nextReminderNumber = Math.max(0, Number(task.sla_reminder_count || 0)) + 1;
      await createNotification({
        userId: task.assigned_to,
        taskId: task.id,
        type: NOTIFICATION_TYPES.TASK_SLA_OVERDUE,
        title: "SLA reminder: task overdue",
        message: `Task "${task.title}" is not solved within ${policy.defaultHours}h SLA.`,
        remindAt: new Date().toISOString(),
        whatsappPhone: task.whatsapp_phone || "",
        whatsappText: [
          `listO reminder: "${task.title}" is still not done.`,
          `SLA: ${policy.defaultHours}h exceeded.`,
          `Task info: ${taskInfoText(task)}`,
          `Task ID: ${task.id.slice(0, 8)}`,
        ].join("\n"),
        dedupeKey: `task.sla.overdue:${task.id}:${nextReminderNumber}`,
        dedupeHours: Math.max(1, reminderRepeatHours),
      });

      await query(
        `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
         values (null, 'task', $1, 'task.sla.reminder.sent', $2::jsonb)`,
        [
          task.id,
          JSON.stringify({
            taskId: task.id,
            defaultHours: policy.defaultHours,
            reminderRepeatHours,
            reminderNumber: nextReminderNumber,
            maxReminders,
          }),
        ]
      );

      await query(
        `update tasks
         set sla_reminded_at = coalesce(sla_reminded_at, now()),
             sla_last_reminded_at = now(),
             sla_reminder_count = coalesce(sla_reminder_count, 0) + 1,
             updated_at = now()
         where id = $1`,
        [task.id]
      );
    }

    const escalatedCandidates = await query(
      `select t.id, t.project_id, t.assigned_to, t.title, t.description, t.sla_due_at, t.sla_reminded_at,
              u.name as assignee_name
       from tasks t
       join users u on u.id = t.assigned_to
       where t.assigned_to is not null
         and t.archived_at is null
         and t.status <> 'done'
         and t.sla_due_at is not null
         and t.sla_reminded_at is not null
         and t.sla_escalated_at is null
         and t.sla_reminded_at <= now() - make_interval(hours => $1)
       order by t.sla_reminded_at asc
       limit 200`,
      [Math.max(1, Number(policy.escalationHours || 2))]
    );

    if (escalatedCandidates.rowCount > 0) {
      const managers = await query(
        "select id, name, whatsapp_phone from users where is_active = true and role in ('admin', 'manager')"
      );

      for (const task of escalatedCandidates.rows) {
        for (const manager of managers.rows) {
          await createNotification({
            userId: manager.id,
            taskId: task.id,
            type: NOTIFICATION_TYPES.TASK_SLA_ESCALATED,
            title: "SLA escalation: unresolved task",
            message: `Task "${task.title}" is still unresolved ${policy.escalationHours}h after assignee reminder.`,
            remindAt: new Date().toISOString(),
            whatsappPhone: manager.whatsapp_phone || "",
            whatsappText: [
              `listO escalation: "${task.title}" still unresolved.`,
              `Assignee: ${task.assignee_name}`,
              `Task info: ${taskInfoText(task)}`,
              `Task ID: ${task.id.slice(0, 8)}`,
            ].join("\n"),
            dedupeKey: `task.sla.escalated:${task.id}:${manager.id}`,
            dedupeHours: 24,
          });
        }

        await query(
          `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
           values (null, 'task', $1, 'task.sla.escalated', $2::jsonb)`,
          [task.id, JSON.stringify({ taskId: task.id, escalationHours: policy.escalationHours })]
        );

        await query("update tasks set sla_escalated_at = now(), updated_at = now() where id = $1", [task.id]);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("SLA scan failed:", error.message);
  } finally {
    running = false;
  }
}

function startSlaReminders() {
  const everyMs = 30 * 1000;
  timer = setInterval(() => {
    (async () => {
      const policy = await getSlaPolicy();
      if (!policy.enabled) return;
      const scanEveryMs = Math.max(30, Number(policy.scanEverySeconds || 300)) * 1000;
      const now = Date.now();
      if (now - lastRunAt < scanEveryMs) return;
      lastRunAt = now;
      await runSlaScan(policy);
    })().catch(() => {});
  }, everyMs);
  (async () => {
    const policy = await getSlaPolicy();
    if (!policy.enabled) return;
    lastRunAt = Date.now();
    await runSlaScan(policy);
  })().catch(() => {});
}

function stopSlaReminders() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startSlaReminders,
  stopSlaReminders,
  runSlaScan,
};
