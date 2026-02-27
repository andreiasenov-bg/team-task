const config = require("../config");
const { query } = require("../db");
const { emitToUser } = require("../realtime");
const { sendTextMessageWithRetry, sendTemplateMessage } = require("../integrations/whatsapp");
const { NOTIFICATION_META } = require("../notifications/types");

function clampTitle(value) {
  return String(value || "").slice(0, 180);
}

function clampMessage(value) {
  return String(value || "").slice(0, 2000);
}

function templateForNotificationType(type) {
  const templates = {
    "task.done.pending_review": config.whatsapp.templateTaskDone,
    "task.review.rejected": config.whatsapp.templateTaskReviewRejected,
    "task.review.reminder": config.whatsapp.templateTaskReviewReminder,
    "task.sla.overdue": config.whatsapp.templateTaskSlaOverdue,
    "task.sla.escalated": config.whatsapp.templateTaskSlaEscalated,
    "digest.daily.summary": config.whatsapp.templateDigestDailySummary,
  };
  return String(templates[type] || "").trim();
}

async function resolveWhatsappPhone(userId) {
  if (!userId) return "";
  const result = await query("select whatsapp_phone from users where id = $1 limit 1", [userId]);
  return result.rows[0] ? String(result.rows[0].whatsapp_phone || "") : "";
}

const DEFAULT_PREFERENCES = {
  in_app_enabled: true,
  whatsapp_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  timezone_offset_minutes: 0,
};

async function getPreferences(userId) {
  if (!userId) return { ...DEFAULT_PREFERENCES };
  const result = await query(
    `select in_app_enabled, whatsapp_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone_offset_minutes
     from notification_preferences
     where user_id = $1
     limit 1`,
    [userId]
  );
  if (result.rowCount === 0) return { ...DEFAULT_PREFERENCES };
  return { ...DEFAULT_PREFERENCES, ...result.rows[0] };
}

function isInsideQuietHours(prefs) {
  if (!prefs.quiet_hours_enabled) return false;
  const now = new Date(Date.now() + Number(prefs.timezone_offset_minutes || 0) * 60 * 1000);
  const hour = now.getUTCHours();
  const start = Number(prefs.quiet_hours_start);
  const end = Number(prefs.quiet_hours_end);
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

async function hasRecentDuplicate(userId, type, dedupeKey, dedupeHours) {
  if (!userId || !type || !dedupeKey || !dedupeHours || dedupeHours <= 0) return false;
  const existing = await query(
    `select 1
     from notifications
     where user_id = $1
       and type = $2
       and dedupe_key = $3
       and created_at >= now() - make_interval(hours => $4)
     limit 1`,
    [userId, type, String(dedupeKey).slice(0, 350), Number(dedupeHours)]
  );
  return existing.rowCount > 0;
}

async function createNotification(input) {
  const {
    userId,
    taskId = null,
    type,
    title,
    message,
    remindAt = null,
    channels = null,
    whatsappPhone = "",
    whatsappText = "",
    dedupeKey = "",
    dedupeHours = 0,
  } = input || {};

  if (!userId || !type || !title) return { ok: false, reason: "invalid_notification_payload" };

  const defaults = NOTIFICATION_META[type] || { channels: ["in_app"] };
  const finalChannels = Array.isArray(channels) && channels.length > 0 ? channels : defaults.channels;
  const prefs = await getPreferences(userId);
  const shouldInApp = finalChannels.includes("in_app") && Boolean(prefs.in_app_enabled);
  const shouldWhatsapp =
    finalChannels.includes("whatsapp") &&
    Boolean(prefs.whatsapp_enabled) &&
    !isInsideQuietHours(prefs);

  if (await hasRecentDuplicate(userId, type, dedupeKey || message, dedupeHours)) {
    return { ok: true, skipped: "deduped" };
  }

  let created = null;
  if (shouldInApp) {
    const inserted = await query(
      `insert into notifications (user_id, task_id, type, dedupe_key, title, message, remind_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, user_id, task_id, type, title, message, is_read, created_at, remind_at`,
      [userId, taskId, type, String(dedupeKey || "").slice(0, 350) || null, clampTitle(title), clampMessage(message), remindAt]
    );
    created = inserted.rows[0];
    emitToUser(userId, "notification.created", { notification: created });
  }

  if (shouldWhatsapp) {
    const phone = whatsappPhone || (await resolveWhatsappPhone(userId));
    if (phone) {
      try {
        const templateName = templateForNotificationType(type);
        if (templateName) {
          const templateResult = await sendTemplateMessage(phone, templateName, config.whatsapp.templateLang || "bg");
          if (!templateResult.ok) {
            await sendTextMessageWithRetry(phone, String(whatsappText || message || title).slice(0, 4096));
          }
        } else {
          await sendTextMessageWithRetry(phone, String(whatsappText || message || title).slice(0, 4096));
        }
      } catch (_error) {
        // Keep in-app delivery resilient even if external channel fails.
      }
    }
  }

  return { ok: true, notification: created };
}

async function notifyUsers(userIds, input) {
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: true, sent: 0 };
  let sent = 0;
  for (const userId of ids) {
    const res = await createNotification({ ...input, userId });
    if (res.ok && !res.skipped) sent += 1;
  }
  return { ok: true, sent };
}

module.exports = {
  createNotification,
  notifyUsers,
  getPreferences,
};
