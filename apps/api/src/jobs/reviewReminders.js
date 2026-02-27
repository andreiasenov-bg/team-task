const config = require("../config");
const { query } = require("../db");
const { createNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../notifications/types");

let timer = null;
let running = false;

async function runReviewReminderScan() {
  if (running) return;
  running = true;
  try {
    const pending = await query(
      `select t.id, t.title
       from tasks t
       where t.status = 'done'
         and t.review_status = 'pending'
         and t.archived_at is null
         and t.updated_at <= now() - interval '1 day'
       limit 300`
    );
    if (pending.rowCount === 0) return;

    const reviewers = await query("select id from users where is_active = true and role in ('admin', 'manager')");
    for (const task of pending.rows) {
      for (const reviewer of reviewers.rows) {
        await createNotification({
          userId: reviewer.id,
          taskId: task.id,
          type: NOTIFICATION_TYPES.TASK_REVIEW_REMINDER,
          title: "Reminder: task still waiting for review",
          message: `Task "${task.title}" is done but not reviewed for over 24h.`,
          remindAt: new Date().toISOString(),
          whatsappText: `Nexus Flow reminder: "${task.title}" чака review над 24ч.`,
          dedupeKey: `task.review.reminder:${task.id}:${reviewer.id}`,
          dedupeHours: 24,
        });
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Review reminder scan failed:", error.message);
  } finally {
    running = false;
  }
}

function startReviewReminders() {
  if (!config.reviewReminder.enabled) return;
  const everyMs = Math.max(60, Number(config.reviewReminder.scanEverySeconds || 600)) * 1000;
  timer = setInterval(() => {
    runReviewReminderScan().catch(() => {});
  }, everyMs);
  runReviewReminderScan().catch(() => {});
}

function stopReviewReminders() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startReviewReminders,
  stopReviewReminders,
  runReviewReminderScan,
};
