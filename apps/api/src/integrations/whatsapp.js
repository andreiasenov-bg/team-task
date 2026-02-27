const config = require("../config");
const { query } = require("../db");

let retryTimer = null;
let retryRunning = false;

function normalizePhone(phone) {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

function normalizeIncomingPhone(phone) {
  return normalizePhone(phone).replace(/^\+/, "");
}

function isReady() {
  if (!config.whatsapp.enabled) return false;
  if (!config.whatsapp.phoneNumberId) return false;
  if (!config.whatsapp.accessToken && !config.whatsapp.dryRun) return false;
  return true;
}

async function findUserByWhatsappPhone(incomingPhone) {
  const normalized = normalizeIncomingPhone(incomingPhone);
  if (!normalized) return null;
  const result = await query(
    `select id, name, email, role, whatsapp_phone
     from users
     where regexp_replace(coalesce(whatsapp_phone, ''), '[^0-9]', '', 'g') = $1
     limit 1`,
    [normalized]
  );
  return result.rows[0] || null;
}

async function sendTextMessage(to, body) {
  if (!isReady()) return { ok: false, reason: "whatsapp_not_configured" };
  const toDigits = normalizeIncomingPhone(to);
  if (!toDigits) return { ok: false, reason: "invalid_recipient" };

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "text",
    text: { body: String(body || "").slice(0, 4096) },
  };

  if (config.whatsapp.dryRun) {
    return { ok: true, dryRun: true, payload };
  }

  return sendWhatsappPayload(payload);
}

async function sendTemplateMessage(to, templateName, languageCode = "en", bodyParameters = []) {
  if (!isReady()) return { ok: false, reason: "whatsapp_not_configured" };
  const toDigits = normalizeIncomingPhone(to);
  if (!toDigits) return { ok: false, reason: "invalid_recipient" };
  const name = String(templateName || "").trim();
  if (!name) return { ok: false, reason: "invalid_template_name" };

  const template = {
    name,
    language: { code: String(languageCode || "en") },
  };
  if (Array.isArray(bodyParameters) && bodyParameters.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: bodyParameters.map((value) => ({ type: "text", text: String(value || "").slice(0, 200) })),
      },
    ];
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template,
  };

  if (config.whatsapp.dryRun) {
    return { ok: true, dryRun: true, payload };
  }

  return sendWhatsappPayload(payload);
}

async function sendWhatsappPayload(payload) {
  const response = await fetch(
    `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: data };
  }
  return { ok: true, data };
}

async function enqueueTextMessage(to, body, maxAttempts = null) {
  const recipient = normalizeIncomingPhone(to);
  if (!recipient) return { ok: false, reason: "invalid_recipient" };
  await query(
    `insert into outbound_message_queue (channel, recipient, body, status, attempts, max_attempts, next_attempt_at)
     values ('whatsapp', $1, $2, 'pending', 0, $3, now())`,
    [recipient, String(body || "").slice(0, 4096), Math.max(1, Number(maxAttempts || config.whatsapp.retryMaxAttempts || 5))]
  );
  return { ok: true };
}

async function sendTextMessageWithRetry(to, body) {
  const result = await sendTextMessage(to, body);
  if (!result.ok && config.whatsapp.retryEnabled) {
    await enqueueTextMessage(to, body);
  }
  return result;
}

async function processRetryQueueOnce() {
  if (retryRunning) return;
  retryRunning = true;
  try {
    const pending = await query(
      `select id, recipient, body, attempts, max_attempts
       from outbound_message_queue
       where channel = 'whatsapp'
         and status = 'pending'
         and next_attempt_at <= now()
       order by next_attempt_at asc
       limit 50`
    );
    for (const row of pending.rows) {
      const result = await sendTextMessage(row.recipient, row.body);
      if (result.ok) {
        await query(
          `update outbound_message_queue
           set status = 'sent', sent_at = now(), updated_at = now()
           where id = $1`,
          [row.id]
        );
        continue;
      }
      const nextAttempts = Number(row.attempts || 0) + 1;
      const maxAttempts = Math.max(1, Number(row.max_attempts || 5));
      const exhausted = nextAttempts >= maxAttempts;
      const backoffMinutes = Math.min(30, Math.max(1, nextAttempts * 2));
      await query(
        `update outbound_message_queue
         set attempts = $2,
             status = case when $3 then 'failed' else 'pending' end,
             last_error = $4,
             next_attempt_at = case when $3 then next_attempt_at else now() + make_interval(mins => $5) end,
             updated_at = now()
         where id = $1`,
        [
          row.id,
          nextAttempts,
          exhausted,
          JSON.stringify(result.error || { reason: result.reason || "send_failed" }).slice(0, 900),
          backoffMinutes,
        ]
      );
    }
  } finally {
    retryRunning = false;
  }
}

function startWhatsappRetryQueue() {
  if (!config.whatsapp.retryEnabled) return;
  const everyMs = Math.max(10, Number(config.whatsapp.retryScanEverySeconds || 30)) * 1000;
  retryTimer = setInterval(() => {
    processRetryQueueOnce().catch(() => {});
  }, everyMs);
  processRetryQueueOnce().catch(() => {});
}

function stopWhatsappRetryQueue() {
  if (!retryTimer) return;
  clearInterval(retryTimer);
  retryTimer = null;
}

module.exports = {
  normalizePhone,
  normalizeIncomingPhone,
  findUserByWhatsappPhone,
  sendTextMessage,
  sendTemplateMessage,
  sendTextMessageWithRetry,
  enqueueTextMessage,
  processRetryQueueOnce,
  startWhatsappRetryQueue,
  stopWhatsappRetryQueue,
  isReady,
};
