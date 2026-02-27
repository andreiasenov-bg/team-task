const NOTIFICATION_TYPES = {
  TASK_DONE_PENDING_REVIEW: "task.done.pending_review",
  TASK_REVIEW_REJECTED: "task.review.rejected",
  TASK_REVIEW_REMINDER: "task.review.reminder",
  TASK_SLA_OVERDUE: "task.sla.overdue",
  TASK_SLA_ESCALATED: "task.sla.escalated",
  PROJECT_WIP_LIMIT_EXCEEDED: "project.wip.limit.exceeded",
  DIGEST_DAILY_SUMMARY: "digest.daily.summary",
};

const NOTIFICATION_META = {
  [NOTIFICATION_TYPES.TASK_DONE_PENDING_REVIEW]: { severity: "warning", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.TASK_REVIEW_REJECTED]: { severity: "warning", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.TASK_REVIEW_REMINDER]: { severity: "warning", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.TASK_SLA_OVERDUE]: { severity: "warning", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.TASK_SLA_ESCALATED]: { severity: "critical", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.PROJECT_WIP_LIMIT_EXCEEDED]: { severity: "warning", channels: ["in_app", "whatsapp"] },
  [NOTIFICATION_TYPES.DIGEST_DAILY_SUMMARY]: { severity: "info", channels: ["in_app", "whatsapp"] },
};

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_META,
};
