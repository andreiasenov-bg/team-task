const config = require("../config");
const { query } = require("../db");
const { createNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../notifications/types");

let timer = null;
let running = false;

async function runDigestScan() {
  if (running) return;
  running = true;
  try {
    const recipients = await query(
      "select id from users where is_active = true and role in ('admin', 'manager') order by created_at asc"
    );
    if (recipients.rowCount === 0) return;

    const statsRes = await query(
      `select
         count(*) filter (where archived_at is null and status <> 'done')::int as open_count,
         count(*) filter (where archived_at is null and status = 'in_progress')::int as in_progress_count,
         count(*) filter (where archived_at is null and status = 'done' and review_status = 'pending')::int as pending_review_count,
         count(*) filter (where archived_at is null and sla_due_at is not null and status <> 'done' and sla_due_at <= now())::int as sla_overdue_count
       from tasks`
    );
    const stats = statsRes.rows[0] || {
      open_count: 0,
      in_progress_count: 0,
      pending_review_count: 0,
      sla_overdue_count: 0,
    };

    const title = "Daily digest summary";
    const message = `Open: ${stats.open_count}, In progress: ${stats.in_progress_count}, Pending review: ${stats.pending_review_count}, SLA overdue: ${stats.sla_overdue_count}.`;
    const whatsappText = `Nexus Flow daily digest\nOpen: ${stats.open_count}\nIn progress: ${stats.in_progress_count}\nPending review: ${stats.pending_review_count}\nSLA overdue: ${stats.sla_overdue_count}`;
    const dateKey = new Date().toISOString().slice(0, 10);

    for (const recipient of recipients.rows) {
      await createNotification({
        userId: recipient.id,
        taskId: null,
        type: NOTIFICATION_TYPES.DIGEST_DAILY_SUMMARY,
        title,
        message,
        remindAt: new Date().toISOString(),
        whatsappText,
        dedupeKey: `digest.daily.summary:${recipient.id}:${dateKey}`,
        dedupeHours: 24,
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Digest scan failed:", error.message);
  } finally {
    running = false;
  }
}

function startDigestNotifications() {
  if (!config.digest.enabled) return;
  const everyMs = Math.max(300, Number(config.digest.scanEverySeconds || 3600)) * 1000;
  timer = setInterval(() => {
    runDigestScan().catch(() => {});
  }, everyMs);
  runDigestScan().catch(() => {});
}

function stopDigestNotifications() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startDigestNotifications,
  stopDigestNotifications,
  runDigestScan,
};
