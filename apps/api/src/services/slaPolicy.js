const config = require("../config");
const { query } = require("../db");

const KEY = "sla_policy";

function defaultPolicy() {
  return {
    enabled: Boolean(config.slaReminder.enabled),
    defaultHours: Math.max(1, Number(config.slaReminder.defaultHours || 3)),
    repeatHours: Math.max(1, Number(config.slaReminder.repeatHours || config.slaReminder.defaultHours || 3)),
    maxReminders: Math.max(1, Number(config.slaReminder.maxReminders || 6)),
    escalationHours: Math.max(1, Number(config.slaReminder.escalationHours || 2)),
    scanEverySeconds: Math.max(30, Number(config.slaReminder.scanEverySeconds || 300)),
  };
}

function parseBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function parseIntRange(value, fallback, min, max) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizePatch(input, fallback) {
  const x = input || {};
  return {
    enabled: parseBool(x.enabled, fallback.enabled),
    defaultHours: parseIntRange(x.defaultHours, fallback.defaultHours, 1, 168),
    repeatHours: parseIntRange(x.repeatHours, fallback.repeatHours, 1, 168),
    maxReminders: parseIntRange(x.maxReminders, fallback.maxReminders, 1, 50),
    escalationHours: parseIntRange(x.escalationHours, fallback.escalationHours, 1, 168),
    scanEverySeconds: parseIntRange(x.scanEverySeconds, fallback.scanEverySeconds, 30, 3600),
  };
}

async function getSlaPolicy() {
  const base = defaultPolicy();
  const result = await query("select value_json from system_settings where setting_key = $1 limit 1", [KEY]);
  if (result.rowCount === 0) return base;
  return normalizePatch(result.rows[0].value_json || {}, base);
}

async function updateSlaPolicy(patch, actorId = null) {
  const current = await getSlaPolicy();
  const next = normalizePatch(patch || {}, current);
  await query(
    `insert into system_settings (setting_key, value_json, updated_by, updated_at)
     values ($1, $2::jsonb, $3, now())
     on conflict (setting_key)
     do update set value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = now()`,
    [KEY, JSON.stringify(next), actorId]
  );
  return next;
}

module.exports = {
  getSlaPolicy,
  updateSlaPolicy,
};

