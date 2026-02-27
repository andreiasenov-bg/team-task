const express = require("express");
const { query } = require("../db");
const { badRequest } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { getPreferences } = require("../services/notificationService");

const router = express.Router();

function parseBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function parseHour(value, fallback, fieldName) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) throw badRequest(`${fieldName} must be 0..23`);
  return n;
}

function parseTzOffset(value, fallback) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < -840 || n > 840) throw badRequest("timezoneOffsetMinutes must be between -840 and 840");
  return n;
}

router.get("/notification-preferences", requireAuth, async (req, res, next) => {
  try {
    const preferences = await getPreferences(req.auth.sub);
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

router.patch("/notification-preferences", requireAuth, async (req, res, next) => {
  try {
    const existing = await getPreferences(req.auth.sub);
    const inAppEnabled = parseBool(req.body && req.body.inAppEnabled, existing.in_app_enabled);
    const whatsappEnabled = parseBool(req.body && req.body.whatsappEnabled, existing.whatsapp_enabled);
    const quietHoursEnabled = parseBool(req.body && req.body.quietHoursEnabled, existing.quiet_hours_enabled);
    const quietHoursStart = parseHour(req.body && req.body.quietHoursStart, existing.quiet_hours_start, "quietHoursStart");
    const quietHoursEnd = parseHour(req.body && req.body.quietHoursEnd, existing.quiet_hours_end, "quietHoursEnd");
    const timezoneOffsetMinutes = parseTzOffset(
      req.body && req.body.timezoneOffsetMinutes,
      existing.timezone_offset_minutes
    );

    await query(
      `insert into notification_preferences (
         user_id, in_app_enabled, whatsapp_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone_offset_minutes, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (user_id)
       do update set
         in_app_enabled = excluded.in_app_enabled,
         whatsapp_enabled = excluded.whatsapp_enabled,
         quiet_hours_enabled = excluded.quiet_hours_enabled,
         quiet_hours_start = excluded.quiet_hours_start,
         quiet_hours_end = excluded.quiet_hours_end,
         timezone_offset_minutes = excluded.timezone_offset_minutes,
         updated_at = now()`,
      [req.auth.sub, inAppEnabled, whatsappEnabled, quietHoursEnabled, quietHoursStart, quietHoursEnd, timezoneOffsetMinutes]
    );

    const preferences = await getPreferences(req.auth.sub);
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
