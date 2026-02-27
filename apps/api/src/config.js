const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const config = {
  host: process.env.API_HOST || "127.0.0.1",
  port: Number(process.env.API_PORT || 3320),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  databaseUrl: process.env.DATABASE_URL || "postgresql://teamtask:teamtask@127.0.0.1:5432/teamtask",
  slaReminder: {
    enabled: String(process.env.SLA_REMINDER_ENABLED || "1") === "1",
    defaultHours: Number(process.env.SLA_DEFAULT_HOURS || 3),
    repeatHours: Number(process.env.SLA_REPEAT_EVERY_HOURS || 3),
    maxReminders: Number(process.env.SLA_MAX_REMINDERS || 6),
    escalationHours: Number(process.env.SLA_ESCALATION_HOURS || 2),
    scanEverySeconds: Number(process.env.SLA_SCAN_EVERY_SECONDS || 300),
  },
  reviewReminder: {
    enabled: String(process.env.REVIEW_REMINDER_ENABLED || "1") === "1",
    scanEverySeconds: Number(process.env.REVIEW_REMINDER_SCAN_EVERY_SECONDS || 600),
  },
  digest: {
    enabled: String(process.env.DIGEST_ENABLED || "1") === "1",
    scanEverySeconds: Number(process.env.DIGEST_SCAN_EVERY_SECONDS || 3600),
  },
  wipLimits: {
    todo: Number(process.env.WIP_LIMIT_TODO || 0),
    inProgress: Number(process.env.WIP_LIMIT_IN_PROGRESS || 0),
    done: Number(process.env.WIP_LIMIT_DONE || 0),
  },
  transcription: {
    enabled: String(process.env.TRANSCRIPTION_ENABLED || "0") === "1",
    dryRun: String(process.env.TRANSCRIPTION_DRY_RUN || "1") === "1",
    provider: process.env.TRANSCRIPTION_PROVIDER || "openai",
    endpoint: process.env.TRANSCRIPTION_ENDPOINT || "https://api.openai.com/v1/audio/transcriptions",
    apiKey: process.env.TRANSCRIPTION_API_KEY || "",
    model: process.env.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_ENABLED || "0") === "1",
    dryRun: String(process.env.WHATSAPP_DRY_RUN || "1") === "1",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "bg",
    templateTaskDone: process.env.WHATSAPP_TEMPLATE_TASK_DONE || "",
    templateTaskReviewRejected: process.env.WHATSAPP_TEMPLATE_TASK_REVIEW_REJECTED || "",
    templateTaskReviewReminder: process.env.WHATSAPP_TEMPLATE_TASK_REVIEW_REMINDER || "",
    templateTaskSlaOverdue: process.env.WHATSAPP_TEMPLATE_TASK_SLA_OVERDUE || "",
    templateTaskSlaEscalated: process.env.WHATSAPP_TEMPLATE_TASK_SLA_ESCALATED || "",
    templateDigestDailySummary: process.env.WHATSAPP_TEMPLATE_DIGEST_DAILY_SUMMARY || "",
    retryEnabled: String(process.env.WHATSAPP_RETRY_ENABLED || "1") === "1",
    retryScanEverySeconds: Number(process.env.WHATSAPP_RETRY_SCAN_EVERY_SECONDS || 30),
    retryMaxAttempts: Number(process.env.WHATSAPP_RETRY_MAX_ATTEMPTS || 5),
  },
};

module.exports = config;
