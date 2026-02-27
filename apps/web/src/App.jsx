import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { io } from "socket.io-client";
import {
  addTaskComment,
  addTaskAttachment,
  archiveTask,
  createAssistantSkill,
  clearReadNotifications,
  createTask,
  deleteTaskAttachment,
  decideAssistantSkillApproval,
  downloadCalendarIcs,
  getNotificationPreferences,
  getSlaPolicy,
  getWhatsappMetrics,
  health,
  listActivity,
  listAssistantSkillApprovals,
  listAssistantSkills,
  listCalendarEvents,
  listWhatsappQueue,
  listNotifications,
  listProjectMembers,
  listProjects,
  listTaskAttachments,
  listTaskComments,
  listTasks,
  login,
  markNotificationRead,
  markAllNotificationsRead,
  me,
  moveTask,
  requeueWhatsappMessage,
  reviewTask,
  updateNotificationPreferences,
  updateSlaPolicy,
  updateTaskSchedule,
} from "./api";

const STATUS = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const REVIEW_SLA_HOURS = 24;
const SCHEDULE_PRESETS = [
  { key: "one_time", label: "One-time" },
  { key: "daily", label: "Daily" },
  { key: "workday", label: "Every workday" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Monthly" },
  { key: "last_business_day", label: "Last business day (monthly)" },
  { key: "custom", label: "Custom" },
];
const DEMO_USERS = [
  { key: "admin", label: "Admin", email: "admin@nexus-flow.local", password: "admin123" },
  { key: "manager", label: "Manager", email: "manager@nexus-flow.local", password: "manager123" },
  { key: "employee", label: "Employee", email: "ivan@nexus-flow.local", password: "123456" },
];
const DEFAULT_SAVED_VIEWS = [
  {
    id: "default-focus",
    label: "Focus Now",
    roles: ["admin", "manager", "employee"],
    readOnly: true,
    filters: { status: "in_progress", review: "", due: "week", sla: "", includeArchived: false, assigneeId: "" },
  },
  {
    id: "default-overdue",
    label: "SLA Overdue",
    roles: ["admin", "manager", "employee"],
    readOnly: true,
    filters: { status: "", review: "", due: "", sla: "sla_overdue", includeArchived: false, assigneeId: "" },
  },
  {
    id: "default-review",
    label: "Review Queue",
    roles: ["admin", "manager"],
    readOnly: true,
    filters: { status: "done", review: "pending", due: "", sla: "", includeArchived: false, assigneeId: "" },
  },
  {
    id: "default-my-open",
    label: "My Open Tasks",
    roles: ["employee"],
    readOnly: true,
    filters: { status: "in_progress", review: "", due: "", sla: "", includeArchived: false, assigneeId: "" },
  },
];

const NOTIFICATION_TYPE_META = {
  "task.done.pending_review": { severity: "warning", label: "Review Queue" },
  "task.review.rejected": { severity: "warning", label: "Rejected" },
  "task.review.reminder": { severity: "critical", label: "Review Reminder" },
  "task.sla.overdue": { severity: "warning", label: "SLA Overdue" },
  "task.sla.escalated": { severity: "critical", label: "SLA Escalated" },
  "project.wip.limit.exceeded": { severity: "warning", label: "WIP Alert" },
  "digest.daily.summary": { severity: "info", label: "Daily Digest" },
};

const QUICK_FILTER_PRESETS = [
  { key: "all", label: "All Active", roles: ["admin", "manager", "employee"] },
  { key: "focus", label: "Focus Now", roles: ["admin", "manager", "employee"] },
  { key: "overdue", label: "Overdue", roles: ["admin", "manager", "employee"] },
  { key: "mine", label: "My Tasks", roles: ["admin", "manager", "employee"] },
  { key: "review", label: "Review Queue", roles: ["admin", "manager"] },
  { key: "escalated", label: "SLA Escalated", roles: ["admin", "manager"] },
];

const I18N = {
  bg: {
    authSubtitle: "Влез, за да отвориш борда. API статус: {status}",
    healthChecking: "проверка",
    healthDown: "недостъпно",
    email: "Имейл",
    password: "Парола",
    signIn: "Вход",
    myTasks: "Моите задачи",
    boardControl: "Контрол на борда",
    projectsCount: "{count} проекта",
    signedInAs: "Влязъл като {name}",
    loading: "зареждане...",
    shortcuts: "Бързи клавиши: N нова задача, / търсене, B борд, C календар",
    density: "Плътност: {value}",
    comfortable: "нормална",
    compact: "компактна",
    notifications: "Известия",
    all: "Всички",
    mentions: "Споменавания",
    newNotification: "Ново известие",
    logout: "Изход",
    board: "Борд",
    calendar: "Календар",
    unread: "непрочетени",
    critical: "критични",
    review: "за ревю",
    openReviewQueue: "Отвори ревю опашка",
    openSlaEscalations: "Отвори SLA ескалации",
    markAllRead: "Маркирай всички прочетени",
    clearOldRead: "Изчисти стари прочетени",
    noNotificationsTab: "Няма известия в този таб.",
    inAppEnabled: "В приложението",
    whatsappEnabled: "WhatsApp",
    quietHours: "Тихи часове",
    quietFrom: "Тих режим от (час)",
    quietTo: "Тих режим до (час)",
    savePrefs: "Запази настройки",
    notificationPrefsUpdated: "Настройките за известия са обновени.",
    notificationPrefsSaved: "Настройките за известия са запазени",
    allReadDone: "Всички известия са маркирани като прочетени",
    readCleared: "Старите прочетени известия са изчистени",
    taskOpened: "Задачата е отворена",
    taskLinkCopied: "Линкът към задачата е копиран",
    taskApproved: "Задачата е одобрена",
    taskRejected: "Задачата е върната",
    reviewRejectPrompt: "Коментар за връщане (по желание)",
    openedReviewQueue: "Отворена е ревю опашката",
    openedSlaEscalations: "Отворени са SLA ескалациите",
    assistantSkillCreated: "AI умението е създадено",
    slaPolicyUpdated: "SLA политиката е обновена.",
    slaPolicySaved: "SLA политиката е запазена",
    whatsappRequeued: "WhatsApp съобщението е върнато в опашката",
    skillRequestStatus: "Заявката за умение е {status}",
    couldNotCopyTaskLink: "Линкът към задачата не може да бъде копиран",
    queueErrorHint190: "Има проблем с Meta токена. Смени WHATSAPP_ACCESS_TOKEN в .env.docker и рестартирай api услугата.",
    general: "Общо",
    notifReviewQueue: "Ревю опашка",
    notifRejected: "Върнати",
    notifReviewReminder: "Напомняне за ревю",
    notifSlaOverdue: "SLA просрочен",
    notifSlaEscalated: "SLA ескалиран",
    notifWipAlert: "WIP предупреждение",
    notifDailyDigest: "Дневен дайджест",
    notifOpenTask: "Отвори задача",
    approve: "Одобри",
    reject: "Върни",
    markRead: "Маркирай прочетено",
    statusTodo: "За правене",
    statusInProgress: "В процес",
    statusDone: "Готово",
    roleAdmin: "Админ",
    roleManager: "Мениджър",
    roleEmployee: "Служител",
    kpiActive: "Активни",
    kpiOverdue: "Просрочени",
    kpiReviewLate: "Ревю SLA >24ч",
    kpiSlaOverdue: "SLA просрочени",
    kpiSlaEscalated: "SLA ескалирани",
    kpiArchived: "Архивирани",
    openMetric: "Отвори {label}",
    adminInbox: "Админ входящи",
    adminInboxNote: "Бързи действия за ревю и ескалации",
    pendingReview: "Чакат ревю",
    noPendingReview: "Няма задачи за ревю.",
    escalatedSla: "SLA ескалирани",
    noEscalatedSla: "Няма ескалирани SLA задачи.",
    assignee: "изпълнител",
    statusText: "статус",
    unknown: "Неизвестен",
    unassigned: "Неразпределена",
    savedViews: "Запазени изгледи",
    selectView: "Избери изглед",
    defaultTag: "(по подразбиране)",
    saveCurrentAs: "Запази текущия като...",
    saveView: "Запази изглед",
    deleteView: "Изтрий изглед",
    viewApplied: "Изгледът е приложен: {name}",
    viewSaved: "Изгледът е запазен: {name}",
    viewRemoved: "Изгледът е изтрит: {name}",
    quickFilters: "Бързи филтри",
    custom: "Персонален",
    quickAll: "Всички активни",
    quickFocus: "Фокус сега",
    quickOverdue: "Просрочени",
    quickMine: "Моите задачи",
    quickReview: "Ревю опашка",
    quickEscalated: "SLA ескалирани",
    myOpenTasks: "Моите отворени задачи",
    slaPolicy: "SLA политика",
    slaPolicyNote: "Живи настройки за напомняния. Влизат в сила без рестарт на API.",
    enabled: "Включено",
    defaultSlaHours: "SLA по подразбиране (часове)",
    repeatEveryHours: "Повтори на (часове)",
    maxRemindersTask: "Макс. напомняния на задача",
    escalationDelayHours: "Забавяне за ескалация (часове)",
    scanIntervalSeconds: "Интервал за сканиране (секунди)",
    saveSlaPolicy: "Запази SLA политика",
    assistantSkillsAdmin: "Админ AI умения",
    assistantSkillsNote: "Създавай динамични SQL умения и одобрявай заявки за достъп.",
    skillKeyPlaceholder: "ключ на умение (напр. overdue-mine)",
    titlePlaceholder: "заглавие",
    descriptionPlaceholder: "описание",
    safeSelectSql: "Безопасен SELECT SQL",
    createSkill: "Създай умение",
    dynamicSkills: "Динамични умения",
    pendingApprovals: "Чакащи одобрения",
    noPendingApprovals: "Няма чакащи одобрения.",
    whatsappQueue: "WhatsApp опашка за доставка",
    whatsappQueueNote: "Следи опитите за изпращане и връщай неуспешните съобщения.",
    refresh: "Обнови",
    queueAll: "всички",
    queueFailed: "неуспешни",
    queuePending: "чакащи",
    queueSent: "изпратени",
    queuePendingLabel: "Чакащи",
    queueFailedLabel: "Неуспешни",
    queueSentLabel: "Изпратени",
    queueEmpty: "Няма съобщения в опашката за този филтър.",
    created: "Създадено",
    attempts: "Опити",
    nextRetry: "Следващ опит",
    lastSent: "Последно изпратено",
    unknownRecipient: "Неизвестен получател",
    requeueNow: "Върни в опашката",
    filterSearch: "Търси в заглавие/описание",
    filterAllStatus: "Всички статуси",
    filterAllReview: "Всички ревю статуси",
    assigneeMe: "Изпълнител: аз",
    filterAllAssignees: "Всички изпълнители",
    filterAllDue: "Всички срокове",
    dueOverdue: "просрочени",
    dueReviewLate: "ревю просрочено 24ч",
    dueToday: "срок днес",
    dueWeek: "срок до 7 дни",
    dueNone: "без срок",
    filterAllSla: "Всички SLA статуси",
    showArchived: "Покажи архивирани",
    quickAddTask: "Бързо добавяне на задача",
    employeeComposerNote: "Създавай и следи само собствените си задачи.",
    managerComposerNote: "Задай изпълнител, срок и график в един поток.",
    taskTitle: "Заглавие на задача",
    description: "Описание",
    priorityLow: "ниска",
    priorityMedium: "средна",
    priorityHigh: "висока",
    assignedToLabel: "Възложена на: {name}",
    create: "Създай",
    recurrenceNone: "еднократно",
    recurrenceDaily: "дневно",
    recurrenceWeekly: "седмично",
    recurrenceMonthly: "месечно",
    interval: "интервал",
    dayOfMonth: "ден от месеца",
    lastBusinessDay: "последен работен ден",
    presetLabel: "Готов шаблон: {label}",
    ruleInterval: "Интервал на правило: {value}",
    scheduleTask: "График на задача: {title}",
    noExtraRule: "няма допълнително правило",
    saveSchedule: "Запази график",
    cancel: "Откажи",
    prev: "Назад",
    next: "Напред",
    month: "Месец",
    agenda: "Дневен ред",
    exportIcal: "Експорт iCal",
    noEventsMonth: "Няма планирани събития за този месец.",
    moreCount: "+{count} още",
    activityTimeline: "Активност",
    activityNote: "Поток на промени по борда и ревю решения.",
    noDescription: "Няма описание",
    priority: "приоритет",
    reviewStatus: "ревю",
    repeat: "повторение",
    due: "срок",
    overdueBadge: "просрочено",
    reviewLateBadge: "ревю SLA >24ч",
    slaOverdueBadge: "sla просрочен",
    escalatedBadge: "ескалирано",
    reviewNote: "бележка от ревю",
    moveTo: "Премести в {status}",
    schedule: "График",
    copyLink: "Копирай линк",
    archive: "Архивирай",
    unarchive: "Върни от архив",
    comment: "Коментар",
    comments: "Коментари",
    noComments: "Още няма коментари.",
    doneCommentHint: "Опиши какво е свършено...",
    addCommentHint: "Добави коментар...",
    postComment: "Публикувай коментар",
    attachments: "Прикачени файлове",
    noAttachments: "Още няма прикачени файлове.",
    attachmentAdded: "Добавен е прикачен файл",
    attachmentRemoved: "Премахнат е прикачен файл",
    remove: "Премахни",
    fileNameOptional: "Име на файл (по желание)",
    fileUrlOptional: "https://file-url (по желание)",
    attach: "Прикачи",
    selectedFile: "Избран файл: {name}",
    weekdaySun: "Нд",
    weekdayMon: "Пн",
    weekdayTue: "Вт",
    weekdayWed: "Ср",
    weekdayThu: "Чт",
    weekdayFri: "Пт",
    weekdaySat: "Сб",
    oneTime: "Еднократно",
    daily: "Ежедневно",
    workday: "Всеки работен ден",
    weekly: "Седмично",
    biweekly: "На 2 седмици",
    monthly: "Месечно",
    lastBusinessMonthly: "Последен работен ден (месечно)",
    reviewPending: "чака",
    reviewApproved: "одобрено",
    reviewRejected: "върнато",
  },
  en: {},
};

function tLabel(lang, key, fallback, vars = {}) {
  const dict = I18N[lang] || {};
  let raw = dict[key] || fallback || key;
  if (typeof raw !== "string") raw = String(raw);
  return raw.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : ""));
}

function roleLabel(role, t) {
  if (role === "admin") return t("roleAdmin", "Admin");
  if (role === "manager") return t("roleManager", "Manager");
  return t("roleEmployee", "Employee");
}

function statusLabel(status, t) {
  if (status === "todo") return t("statusTodo", "To Do");
  if (status === "in_progress") return t("statusInProgress", "In Progress");
  return t("statusDone", "Done");
}

function priorityLabel(priority, t) {
  if (priority === "high") return t("priorityHigh", "high");
  if (priority === "medium") return t("priorityMedium", "medium");
  return t("priorityLow", "low");
}

function reviewStatusLabel(status, t) {
  if (status === "approved") return t("reviewApproved", "approved");
  if (status === "rejected") return t("reviewRejected", "rejected");
  return t("reviewPending", "pending");
}

function schedulePresetLabel(preset, t) {
  if (preset === "daily") return t("daily", "Daily");
  if (preset === "workday") return t("workday", "Every workday");
  if (preset === "weekly") return t("weekly", "Weekly");
  if (preset === "biweekly") return t("biweekly", "Every 2 weeks");
  if (preset === "monthly") return t("monthly", "Monthly");
  if (preset === "last_business_day") return t("lastBusinessMonthly", "Last business day (monthly)");
  if (preset === "custom") return t("custom", "Custom");
  return t("oneTime", "One-time");
}

function dueFilterLabel(value, t) {
  if (value === "overdue") return t("dueOverdue", "overdue");
  if (value === "review_late") return t("dueReviewLate", "review overdue 24h");
  if (value === "today") return t("dueToday", "due today");
  if (value === "week") return t("dueWeek", "due in 7d");
  if (value === "none") return t("dueNone", "no due date");
  return "";
}

function quickFilterLabel(key, fallback, t) {
  if (key === "all") return t("quickAll", "All Active");
  if (key === "focus") return t("quickFocus", "Focus Now");
  if (key === "overdue") return t("quickOverdue", "Overdue");
  if (key === "mine") return t("quickMine", "My Tasks");
  if (key === "review") return t("quickReview", "Review Queue");
  if (key === "escalated") return t("quickEscalated", "SLA Escalated");
  return fallback || key;
}

function weekdayLabel(day, t) {
  if (day === "sun") return t("weekdaySun", "Sun");
  if (day === "mon") return t("weekdayMon", "Mon");
  if (day === "tue") return t("weekdayTue", "Tue");
  if (day === "wed") return t("weekdayWed", "Wed");
  if (day === "thu") return t("weekdayThu", "Thu");
  if (day === "fri") return t("weekdayFri", "Fri");
  return t("weekdaySat", "Sat");
}

function queueStatusLabel(status, t) {
  if (status === "failed") return t("queueFailed", "failed");
  if (status === "sent") return t("queueSent", "sent");
  return t("queuePending", "pending");
}

function healthLabel(state, t) {
  if (state === "ok") return "ok";
  if (state === "down") return t("healthDown", "down");
  return t("healthChecking", "checking");
}

function savedViewLabel(view, t) {
  if (!view || !view.id) return "";
  if (view.id === "default-focus") return t("quickFocus", "Focus Now");
  if (view.id === "default-overdue") return t("kpiSlaOverdue", "SLA Overdue");
  if (view.id === "default-review") return t("quickReview", "Review Queue");
  if (view.id === "default-my-open") return t("myOpenTasks", "My Open Tasks");
  return view.label || "";
}

function notificationTypeLabel(type, t, fallback = "") {
  if (type === "task.done.pending_review") return t("notifReviewQueue", "Review Queue");
  if (type === "task.review.rejected") return t("notifRejected", "Rejected");
  if (type === "task.review.reminder") return t("notifReviewReminder", "Review Reminder");
  if (type === "task.sla.overdue") return t("notifSlaOverdue", "SLA Overdue");
  if (type === "task.sla.escalated") return t("notifSlaEscalated", "SLA Escalated");
  if (type === "project.wip.limit.exceeded") return t("notifWipAlert", "WIP Alert");
  if (type === "digest.daily.summary") return t("notifDailyDigest", "Daily Digest");
  return fallback || t("general", "General");
}

function getNotificationMeta(type, resolveLabel) {
  const meta = NOTIFICATION_TYPE_META[String(type || "")];
  if (meta) {
    return {
      ...meta,
      label: typeof resolveLabel === "function" ? resolveLabel(type, meta.label) : meta.label,
    };
  }
  return {
    severity: "info",
    label: typeof resolveLabel === "function" ? resolveLabel(type, "General") : "General",
  };
}

function formatQueueDate(value, locale) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(locale || undefined);
}

function parseQueueError(lastError) {
  if (!lastError) return null;
  let source = lastError;
  if (typeof source === "string") {
    const raw = source.trim();
    if (!raw) return null;
    try {
      source = JSON.parse(raw);
    } catch {
      return { message: raw, code: "", type: "", trace: "" };
    }
  }
  if (typeof source !== "object") {
    return { message: String(source), code: "", type: "", trace: "" };
  }
  const nested = source && typeof source.error === "object" ? source.error : source;
  const message = nested && nested.message ? String(nested.message) : String(source.message || "Unknown error");
  return {
    message,
    code: nested && nested.code != null ? String(nested.code) : "",
    type: nested && nested.type ? String(nested.type) : "",
    trace: nested && nested.fbtrace_id ? String(nested.fbtrace_id) : "",
  };
}

function queueErrorHint(errorMeta, t) {
  if (!errorMeta) return "";
  if (errorMeta.code === "190") {
    return t("queueErrorHint190", "Meta token issue detected. Rotate WHATSAPP_ACCESS_TOKEN in .env.docker and restart the api service.");
  }
  return "";
}

function ListoMark() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="listoMarkBg" x1="6" y1="4" x2="50" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8FD3FF" />
          <stop offset="0.54" stopColor="#3F8CFF" />
          <stop offset="1" stopColor="#0F57D2" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="53" height="53" rx="14" fill="url(#listoMarkBg)" />
      <rect x="13" y="13" width="18" height="30" rx="5" fill="rgba(255, 255, 255, 0.94)" />
      <rect x="18" y="19" width="8" height="2.8" rx="1.4" fill="#2B68D6" />
      <rect x="18" y="25" width="8" height="2.8" rx="1.4" fill="#2B68D6" />
      <rect x="18" y="31" width="8" height="2.8" rx="1.4" fill="#2B68D6" />
      <circle cx="38.5" cy="28" r="9" fill="none" stroke="#FFFFFF" strokeWidth="4" />
      <circle cx="38.5" cy="28" r="5.1" fill="#FF8266" />
      <path d="M35.8 28l1.7 1.9 3.5-3.7" fill="none" stroke="#FFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function weekdayFromDateInput(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return "mon";
  const day = d.getDay();
  return WEEKDAY_OPTIONS[(day + 6) % 7];
}

function dayOfMonthFromDateInput(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return 1;
  return d.getDate();
}

function applyPresetToSchedule(preset, dueDate, current = {}) {
  const weekday = weekdayFromDateInput(dueDate);
  const dayOfMonth = dayOfMonthFromDateInput(dueDate);
  const base = {
    recurrenceType: "none",
    recurrenceInterval: 1,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: "",
    recurrenceMonthlyMode: "day_of_month",
    ...current,
  };

  if (preset === "one_time") return { ...base, recurrenceType: "none", recurrenceInterval: 1, recurrenceWeekdays: [], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "day_of_month" };
  if (preset === "daily") return { ...base, recurrenceType: "daily", recurrenceInterval: 1, recurrenceWeekdays: [], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "day_of_month" };
  if (preset === "workday") return { ...base, recurrenceType: "weekly", recurrenceInterval: 1, recurrenceWeekdays: ["mon", "tue", "wed", "thu", "fri"], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "day_of_month" };
  if (preset === "weekly") return { ...base, recurrenceType: "weekly", recurrenceInterval: 1, recurrenceWeekdays: [weekday], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "day_of_month" };
  if (preset === "biweekly") return { ...base, recurrenceType: "weekly", recurrenceInterval: 2, recurrenceWeekdays: [weekday], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "day_of_month" };
  if (preset === "monthly") return { ...base, recurrenceType: "monthly", recurrenceInterval: 1, recurrenceWeekdays: [], recurrenceDayOfMonth: String(dayOfMonth), recurrenceMonthlyMode: "day_of_month" };
  if (preset === "last_business_day") return { ...base, recurrenceType: "monthly", recurrenceInterval: 1, recurrenceWeekdays: [], recurrenceDayOfMonth: "", recurrenceMonthlyMode: "last_business_day" };
  return base;
}

function inferPreset(task) {
  if (!task || task.recurrence_type === "none") return "one_time";
  if (task.recurrence_type === "daily" && Number(task.recurrence_interval || 1) === 1) return "daily";
  if (task.recurrence_type === "weekly") {
    const w = Array.isArray(task.recurrence_weekdays) ? task.recurrence_weekdays : [];
    const joined = [...w].sort().join(",");
    if (Number(task.recurrence_interval || 1) === 1 && joined === "fri,mon,thu,tue,wed") return "workday";
    if (Number(task.recurrence_interval || 1) === 1 && w.length === 1) return "weekly";
    if (Number(task.recurrence_interval || 1) === 2 && w.length === 1) return "biweekly";
  }
  if (task.recurrence_type === "monthly") {
    if ((task.recurrence_monthly_mode || "day_of_month") === "last_business_day") return "last_business_day";
    if (Number(task.recurrence_interval || 1) === 1) return "monthly";
  }
  return "custom";
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function isOverdue(task) {
  if (!task || !task.due_date || task.archived_at) return false;
  return new Date(task.due_date).getTime() < Date.now() && task.status !== "done";
}

function isPendingReviewLate(task) {
  if (!task || task.status !== "done" || task.review_status !== "pending" || task.archived_at) return false;
  const updated = new Date(task.updated_at).getTime();
  if (Number.isNaN(updated)) return false;
  return Date.now() - updated > REVIEW_SLA_HOURS * 60 * 60 * 1000;
}

function isSlaOverdue(task) {
  if (!task || task.archived_at) return false;
  if (task.status === "done") return false;
  if (!task.sla_due_at) return false;
  return new Date(task.sla_due_at).getTime() <= Date.now();
}

function isSlaEscalated(task) {
  if (!task || task.archived_at) return false;
  return Boolean(task.sla_escalated_at);
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function getMonthRange(offset = 0, locale) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const from = new Date(base);
  const to = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59));
  return { from, to, title: base.toLocaleString(locale || undefined, { month: "long", year: "numeric" }) };
}

export default function App() {
  const [token, setToken] = useLocalStorage("nexus_token", "");
  const [density, setDensity] = useLocalStorage("nexus_density", "comfortable");
  const [uiLang, setUiLang] = useLocalStorage("listo_lang", "bg");
  const [currentUser, setCurrentUser] = useState(null);
  const [healthState, setHealthState] = useState("checking");
  const [authForm, setAuthForm] = useState({ email: "admin@nexus-flow.local", password: "admin123" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const lang = uiLang === "en" ? "en" : "bg";
  const locale = lang === "bg" ? "bg-BG" : "en-US";
  const t = (key, fallback, vars = {}) => tLabel(lang, key, fallback, vars);

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [members, setMembers] = useState([]);

  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState("");

  const [openCommentTaskId, setOpenCommentTaskId] = useState("");
  const [commentsByTask, setCommentsByTask] = useState({});
  const [commentDraftByTask, setCommentDraftByTask] = useState({});
  const [attachmentsByTask, setAttachmentsByTask] = useState({});
  const [attachmentDraftByTask, setAttachmentDraftByTask] = useState({});

  const [notifications, setNotifications] = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [notifTab, setNotifTab] = useState("unread");
  const [notificationPrefs, setNotificationPrefs] = useState({
    in_app_enabled: true,
    whatsapp_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: 22,
    quiet_hours_end: 8,
    timezone_offset_minutes: new Date().getTimezoneOffset() * -1,
  });

  const [viewMode, setViewMode] = useState("board");
  const [calendarLayout, setCalendarLayout] = useState("grid");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [calendarEvents, setCalendarEvents] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [slaFilter, setSlaFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [customSavedViews, setCustomSavedViews] = useLocalStorage("nexus_saved_views", []);
  const [savedViewName, setSavedViewName] = useState("");
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");
  const [assistantSkills, setAssistantSkills] = useState([]);
  const [assistantApprovals, setAssistantApprovals] = useState([]);
  const [whatsappMetrics, setWhatsappMetrics] = useState(null);
  const [whatsappQueue, setWhatsappQueue] = useState([]);
  const [whatsappQueueFilter, setWhatsappQueueFilter] = useState("failed");
  const [slaPolicy, setSlaPolicy] = useState({
    enabled: true,
    defaultHours: 3,
    repeatHours: 3,
    maxReminders: 6,
    escalationHours: 2,
    scanEverySeconds: 300,
  });
  const [assistantSkillForm, setAssistantSkillForm] = useState({
    skillKey: "",
    title: "",
    description: "",
    querySql: "select id,title,status,due_date from tasks where due_date is not null and due_date < now() order by due_date asc limit 10",
    roles: { employee: true, manager: true, admin: true },
  });

  const socketRef = useRef(null);
  const taskTitleInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const filterBarRef = useRef(null);
  const adminInboxRef = useRef(null);

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "low",
    status: "todo",
    assignedTo: "",
    dueDate: "",
    recurrencePreset: "one_time",
    recurrenceType: "none",
    recurrenceInterval: 1,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: "",
    recurrenceMonthlyMode: "day_of_month",
    recurrenceEndAt: "",
  });
  const [scheduleEditor, setScheduleEditor] = useState(null);
  const [pendingTaskDeepLinkId, setPendingTaskDeepLinkId] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filters = useMemo(
    () => ({
      search: search.trim(),
      status: statusFilter,
      review: reviewFilter,
      assigneeId: currentUser && currentUser.role === "employee" ? currentUser.id : assigneeFilter,
      includeArchived,
    }),
    [search, statusFilter, reviewFilter, assigneeFilter, includeArchived, currentUser]
  );

  const filteredTasks = useMemo(() => {
    let scoped = tasks;
    const now = Date.now();
    if (dueFilter === "overdue") scoped = scoped.filter((task) => isOverdue(task));
    if (dueFilter === "today") {
      scoped = scoped.filter((task) => {
        if (!task.due_date || task.archived_at) return false;
        const d = new Date(task.due_date);
        const n = new Date(now);
        return (
          d.getFullYear() === n.getFullYear() &&
          d.getMonth() === n.getMonth() &&
          d.getDate() === n.getDate()
        );
      });
    }
    if (dueFilter === "week") {
      const end = now + 7 * 24 * 60 * 60 * 1000;
      scoped = scoped.filter((task) => {
        if (!task.due_date || task.archived_at) return false;
        const ts = new Date(task.due_date).getTime();
        return ts >= now && ts <= end;
      });
    }
    if (dueFilter === "none") scoped = scoped.filter((task) => !task.due_date && !task.archived_at);
    if (dueFilter === "review_late") scoped = scoped.filter((task) => isPendingReviewLate(task));
    if (slaFilter === "sla_overdue") scoped = scoped.filter((task) => isSlaOverdue(task));
    if (slaFilter === "sla_escalated") scoped = scoped.filter((task) => isSlaEscalated(task));
    return scoped;
  }, [tasks, dueFilter, slaFilter]);

  const grouped = useMemo(() => {
    const buckets = { todo: [], in_progress: [], done: [] };
    for (const task of filteredTasks) {
      if (buckets[task.status]) buckets[task.status].push(task);
    }
    return buckets;
  }, [filteredTasks]);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [tasks, activeTaskId]);
  const memberNameById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const canReview = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isPrivileged = canReview;
  const isEmployee = currentUser && currentUser.role === "employee";
  const userRole = currentUser && currentUser.role ? currentUser.role : "employee";
  const quickFilters = useMemo(
    () => QUICK_FILTER_PRESETS.filter((preset) => preset.roles.includes(userRole)),
    [userRole]
  );

  const availableSavedViews = useMemo(() => {
    const defaults = DEFAULT_SAVED_VIEWS.filter((view) => view.roles.includes(userRole));
    const custom = (customSavedViews || []).filter(
      (view) => !view.roles || view.roles.includes("all") || view.roles.includes(userRole)
    );
    return [...defaults, ...custom];
  }, [userRole, customSavedViews]);

  const monthRange = useMemo(() => getMonthRange(calendarMonthOffset, locale), [calendarMonthOffset, locale]);

  const calendarGrouped = useMemo(() => {
    const map = new Map();
    for (const ev of calendarEvents) {
      const key = new Date(ev.start).toLocaleDateString(locale);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [calendarEvents, locale]);

  const calendarGrid = useMemo(() => {
    const keyFromDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const start = new Date(monthRange.from);
    const end = new Date(monthRange.to);
    const firstDayWeekIndex = start.getDay();
    const totalDays = end.getDate();

    const eventsByDay = {};
    for (const ev of calendarEvents) {
      const evDate = new Date(ev.start);
      const key = keyFromDate(evDate);
      if (!eventsByDay[key]) eventsByDay[key] = [];
      eventsByDay[key].push(ev);
    }

    const cells = [];
    for (let i = 0; i < firstDayWeekIndex; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), day);
      const key = keyFromDate(date);
      cells.push({ day, key, events: eventsByDay[key] || [] });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthRange.from, monthRange.to, calendarEvents]);

  const kpis = useMemo(() => {
    const active = tasks.filter((task) => !task.archived_at);
    return {
      active: active.length,
      overdue: active.filter((task) => isOverdue(task)).length,
      pendingReviewLate: active.filter((task) => isPendingReviewLate(task)).length,
      slaOverdue: active.filter((task) => isSlaOverdue(task)).length,
      slaEscalated: active.filter((task) => isSlaEscalated(task)).length,
      archived: tasks.filter((task) => Boolean(task.archived_at)).length,
    };
  }, [tasks]);

  const adminInbox = useMemo(() => {
    if (!isPrivileged) return { reviewQueue: [], slaEscalated: [] };
    const active = tasks.filter((task) => !task.archived_at);
    const reviewQueue = active
      .filter((task) => task.status === "done" && task.review_status === "pending")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 8);
    const slaEscalated = active
      .filter((task) => isSlaEscalated(task))
      .sort((a, b) => new Date(b.sla_escalated_at || b.updated_at).getTime() - new Date(a.sla_escalated_at || a.updated_at).getTime())
      .slice(0, 8);
    return { reviewQueue, slaEscalated };
  }, [isPrivileged, tasks]);

  const visibleNotifications = useMemo(() => {
    if (notifTab === "all") return notifications;
    if (notifTab === "unread") return notifications.filter((n) => !n.is_read);
    if (notifTab === "critical") {
      return notifications.filter((n) => ["task.sla.escalated", "task.review.reminder", "task.sla.overdue"].includes(n.type));
    }
    if (notifTab === "mentions") {
      return notifications.filter((n) => String(n.message || "").includes("@"));
    }
    return notifications;
  }, [notifications, notifTab]);

  const notificationSummary = useMemo(() => {
    const unread = notifications.filter((n) => !n.is_read).length;
    const criticalUnread = notifications.filter(
      (n) => !n.is_read && getNotificationMeta(n.type, (type, fallback) => notificationTypeLabel(type, t, fallback)).severity === "critical"
    ).length;
    const reviewUnread = notifications.filter(
      (n) => !n.is_read && ["task.done.pending_review", "task.review.reminder"].includes(n.type)
    ).length;
    return { unread, criticalUnread, reviewUnread };
  }, [notifications, lang]);

  const groupedVisibleNotifications = useMemo(() => {
    const groups = new Map();
    for (const n of visibleNotifications) {
      const meta = getNotificationMeta(n.type, (type, fallback) => notificationTypeLabel(type, t, fallback));
      const key = `${n.type || "general"}`;
      if (!groups.has(key)) groups.set(key, { key, type: n.type || "general", label: meta.label, severity: meta.severity, items: [] });
      groups.get(key).items.push(n);
    }
    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
  }, [visibleNotifications, lang]);

  async function refreshTasks(projectId = selectedProjectId, nextFilters = filters) {
    if (!token || !projectId) return;
    const data = await listTasks(token, projectId, nextFilters);
    setTasks(data.tasks || []);
  }

  async function refreshActivity(projectId = selectedProjectId) {
    if (!token || !projectId) return;
    const data = await listActivity(token, projectId, 50);
    setActivity(data.activity || []);
  }

  async function refreshNotifications() {
    if (!token) return;
    const data = await listNotifications(token);
    setNotifications(data.notifications || []);
    setNotifUnread(data.unread || 0);
  }

  async function refreshNotificationPreferences() {
    if (!token) return;
    const data = await getNotificationPreferences(token);
    if (data && data.preferences) setNotificationPrefs(data.preferences);
  }

  async function refreshAssistantAdminData() {
    if (!token || !isPrivileged) return;
    const [skillsData, approvalsData] = await Promise.all([
      listAssistantSkills(token, true),
      listAssistantSkillApprovals(token, "pending"),
    ]);
    setAssistantSkills(skillsData.skills || []);
    setAssistantApprovals(approvalsData.approvals || []);
  }

  async function refreshSlaPolicy() {
    if (!token || !isPrivileged) return;
    const data = await getSlaPolicy(token);
    if (data && data.policy) setSlaPolicy(data.policy);
  }

  async function refreshWhatsappOps() {
    if (!token || !isPrivileged) return;
    const [metricsData, queueData] = await Promise.all([
      getWhatsappMetrics(token),
      listWhatsappQueue(token, whatsappQueueFilter, 40),
    ]);
    setWhatsappMetrics(metricsData.metrics || null);
    setWhatsappQueue(queueData.queue || []);
  }

  async function refreshCalendar() {
    if (!token || !selectedProjectId) return;
    const data = await listCalendarEvents(
      token,
      selectedProjectId,
      monthRange.from.toISOString(),
      monthRange.to.toISOString()
    );
    setCalendarEvents(data.events || []);
  }

  function pushToast(message, tone = "info") {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((curr) => [...curr, { id, message: String(message || ""), tone }].slice(-5));
    setTimeout(() => {
      setToasts((curr) => curr.filter((x) => x.id !== id));
    }, 3800);
  }

  useEffect(() => {
    health().then(() => setHealthState("ok")).catch(() => setHealthState("down"));
  }, []);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }
    me(token)
      .then((data) => setCurrentUser(data.user))
      .catch(() => setToken(""));
  }, [token, setToken]);

  useEffect(() => {
    if (!token) return;
    listProjects(token)
      .then((data) => {
        const next = data.projects || [];
        setProjects(next);
        const params = new URLSearchParams(window.location.search || "");
        const queryProjectId = String(params.get("projectId") || "");
        if (queryProjectId && next.some((p) => p.id === queryProjectId)) {
          setSelectedProjectId(queryProjectId);
        } else if (!selectedProjectId && next[0]) {
          setSelectedProjectId(next[0].id);
        }
        const queryTaskId = String(params.get("task") || "");
        if (queryTaskId) setPendingTaskDeepLinkId(queryTaskId);
      })
      .catch((e) => setError(e.message));
  }, [token, selectedProjectId]);

  useEffect(() => {
    if (!token || !selectedProjectId) return;
    listProjectMembers(token, selectedProjectId)
      .then((data) => {
        const nextMembers = data.members || [];
        setMembers(nextMembers);
        setTaskForm((prev) => {
          if (prev.assignedTo && nextMembers.some((m) => m.id === prev.assignedTo)) return prev;
          if (currentUser && nextMembers.some((m) => m.id === currentUser.id)) return { ...prev, assignedTo: currentUser.id };
          return { ...prev, assignedTo: "" };
        });
      })
      .catch((e) => setError(e.message));
  }, [token, selectedProjectId, currentUser]);

  useEffect(() => {
    refreshTasks().catch((e) => setError(e.message));
    refreshActivity().catch((e) => setError(e.message));
  }, [token, selectedProjectId, filters]);

  useEffect(() => {
    refreshCalendar().catch((e) => setError(e.message));
  }, [token, selectedProjectId, monthRange.from.toISOString(), monthRange.to.toISOString()]);

  useEffect(() => {
    if (!token) return;
    refreshNotifications().catch((e) => setError(e.message));
    refreshNotificationPreferences().catch((e) => setError(e.message));
    const timer = setInterval(() => refreshNotifications().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    refreshAssistantAdminData().catch((e) => setError(e.message));
  }, [token, isPrivileged]);

  useEffect(() => {
    refreshSlaPolicy().catch((e) => setError(e.message));
  }, [token, isPrivileged]);

  useEffect(() => {
    refreshWhatsappOps().catch((e) => setError(e.message));
  }, [token, isPrivileged, whatsappQueueFilter]);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) socketRef.current.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io("http://127.0.0.1:3320", { transports: ["websocket"] });
    socketRef.current = socket;

    const onEvent = () => {
      refreshTasks().catch(() => {});
      refreshActivity().catch(() => {});
      refreshNotifications().catch(() => {});
      refreshCalendar().catch(() => {});
    };

    socket.on("project.created", ({ project }) => {
      if (!project) return;
      setProjects((curr) => (curr.some((x) => x.id === project.id) ? curr : [project, ...curr]));
    });
    socket.on("task.created", onEvent);
    socket.on("task.moved", onEvent);
    socket.on("task.reviewed", onEvent);
    socket.on("task.archived", onEvent);
    socket.on("task.schedule.updated", onEvent);
    socket.on("notification.created", ({ notification }) => {
      if (!notification) return;
      setNotifications((curr) => [notification, ...curr].slice(0, 100));
      setNotifUnread((curr) => curr + 1);
      setInfo(notification.title || t("newNotification", "New notification"));
      pushToast(notification.title || t("newNotification", "New notification"), "info");
      refreshNotifications().catch(() => {});
    });
    socket.on("notification.read", ({ notificationId }) => {
      if (!notificationId) return;
      setNotifications((curr) => {
        const wasUnread = curr.some((n) => n.id === notificationId && !n.is_read);
        if (wasUnread) setNotifUnread((count) => Math.max(0, count - 1));
        return curr.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n));
      });
    });
    socket.on("notification.read_all", () => {
      setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true })));
      setNotifUnread(0);
    });
    socket.on("notification.cleared", () => {
      refreshNotifications().catch(() => {});
    });
    socket.on("comment.added", ({ taskId, comment }) => {
      if (!taskId || !comment) return;
      setCommentsByTask((curr) => ({ ...curr, [taskId]: [...(curr[taskId] || []), comment] }));
      onEvent();
    });
    socket.on("task.attachment.added", ({ taskId, attachment }) => {
      if (!taskId || !attachment) return;
      setAttachmentsByTask((curr) => ({ ...curr, [taskId]: [...(curr[taskId] || []), attachment] }));
      onEvent();
    });
    socket.on("task.attachment.removed", ({ taskId, attachmentId }) => {
      if (!taskId || !attachmentId) return;
      setAttachmentsByTask((curr) => ({
        ...curr,
        [taskId]: (curr[taskId] || []).filter((x) => x.id !== attachmentId),
      }));
      onEvent();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, selectedProjectId, filters, monthRange.from.toISOString(), monthRange.to.toISOString(), lang]);

  useEffect(() => {
    if (!socketRef.current || !selectedProjectId) return;
    socketRef.current.emit("subscribe-project", selectedProjectId);
    return () => {
      if (socketRef.current) socketRef.current.emit("unsubscribe-project", selectedProjectId);
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!socketRef.current || !currentUser || !currentUser.id) return;
    socketRef.current.emit("subscribe-user", currentUser.id);
    return () => {
      if (socketRef.current) socketRef.current.emit("unsubscribe-user", currentUser.id);
    };
  }, [currentUser]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
        if (event.key !== "/") return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        taskTitleInputRef.current?.focus();
      }
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key.toLowerCase() === "b") setViewMode("board");
      if (event.key.toLowerCase() === "c") setViewMode("calendar");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function onLogin(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await login(authForm.email, authForm.password);
      setToken(data.token);
      setCurrentUser(data.user);
    } catch (e) {
      setError(e.message);
    }
  }

  function useDemoAccount(key) {
    const match = DEMO_USERS.find((x) => x.key === key);
    if (!match) return;
    setAuthForm({ email: match.email, password: match.password });
    setError("");
  }

  function applySavedView(viewId) {
    const view = availableSavedViews.find((x) => x.id === viewId);
    if (!view) return;
    const f = view.filters || {};
    setSearch(String(f.search || ""));
    setStatusFilter(String(f.status || ""));
    setReviewFilter(String(f.review || ""));
    setDueFilter(String(f.due || ""));
    setSlaFilter(String(f.sla || ""));
    setIncludeArchived(Boolean(f.includeArchived));
    if (!isEmployee) setAssigneeFilter(String(f.assigneeId || ""));
    setActiveSavedViewId(view.id);
    setActiveQuickFilter("custom");
    const label = savedViewLabel(view, t);
    setInfo(t("viewApplied", "View applied: {name}", { name: label }));
  }

  function saveCurrentView() {
    const name = savedViewName.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const payload = {
      id,
      label: name,
      roles: [userRole],
      filters: {
        search,
        status: statusFilter,
        review: reviewFilter,
        due: dueFilter,
        sla: slaFilter,
        includeArchived,
        assigneeId: isEmployee ? "" : assigneeFilter,
      },
    };
    setCustomSavedViews((curr) => {
      const withoutSameName = (curr || []).filter((v) => String(v.label).toLowerCase() !== name.toLowerCase());
      return [...withoutSameName, payload];
    });
    setSavedViewName("");
    setActiveSavedViewId(id);
    setInfo(t("viewSaved", "View saved: {name}", { name }));
  }

  function deleteActiveCustomView() {
    const selected = availableSavedViews.find((v) => v.id === activeSavedViewId);
    if (!selected || selected.readOnly) return;
    setCustomSavedViews((curr) => (curr || []).filter((v) => v.id !== selected.id));
    setActiveSavedViewId("");
    const label = savedViewLabel(selected, t);
    setInfo(t("viewRemoved", "View removed: {name}", { name: label }));
  }

  function applyQuickFilter(presetKey) {
    const key = String(presetKey || "all");
    setActiveQuickFilter(key);
    setActiveSavedViewId("");

    if (key === "all") {
      setSearch("");
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("");
      setIncludeArchived(false);
      if (!isEmployee) setAssigneeFilter("");
      return;
    }
    if (key === "focus") {
      setStatusFilter("in_progress");
      setReviewFilter("");
      setDueFilter("week");
      setSlaFilter("");
      setIncludeArchived(false);
      return;
    }
    if (key === "overdue") {
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("overdue");
      setSlaFilter("");
      setIncludeArchived(false);
      return;
    }
    if (key === "mine") {
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("");
      setIncludeArchived(false);
      if (!isEmployee && currentUser) setAssigneeFilter(currentUser.id);
      return;
    }
    if (key === "review") {
      setStatusFilter("done");
      setReviewFilter("pending");
      setDueFilter("");
      setSlaFilter("");
      setIncludeArchived(false);
      return;
    }
    if (key === "escalated") {
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("sla_escalated");
      setIncludeArchived(false);
    }
  }

  function scrollToRef(ref) {
    if (!ref || !ref.current) return;
    requestAnimationFrame(() => {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function onKpiNavigate(metricKey) {
    setViewMode("board");
    setActiveSavedViewId("");

    if (metricKey === "active") {
      applyQuickFilter("all");
      scrollToRef(filterBarRef);
      return;
    }
    if (metricKey === "overdue") {
      applyQuickFilter("overdue");
      scrollToRef(filterBarRef);
      return;
    }
    if (metricKey === "pendingReviewLate") {
      setActiveQuickFilter("custom");
      setStatusFilter("done");
      setReviewFilter("pending");
      setDueFilter("review_late");
      setSlaFilter("");
      setIncludeArchived(false);
      if (!isEmployee) setAssigneeFilter("");
      if (isPrivileged) {
        scrollToRef(adminInboxRef);
      } else {
        scrollToRef(filterBarRef);
      }
      return;
    }
    if (metricKey === "slaOverdue") {
      setActiveQuickFilter("custom");
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("sla_overdue");
      setIncludeArchived(false);
      if (!isEmployee) setAssigneeFilter("");
      scrollToRef(filterBarRef);
      return;
    }
    if (metricKey === "slaEscalated") {
      applyQuickFilter("escalated");
      if (isPrivileged) {
        scrollToRef(adminInboxRef);
      } else {
        scrollToRef(filterBarRef);
      }
      return;
    }
    if (metricKey === "archived") {
      setActiveQuickFilter("custom");
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("");
      setIncludeArchived(true);
      if (!isEmployee) setAssigneeFilter("");
      scrollToRef(filterBarRef);
    }
  }

  async function onCreateTask(event) {
    event.preventDefault();
    if (!selectedProjectId) return;
    try {
      const normalized =
        taskForm.recurrencePreset === "custom"
          ? {
              recurrenceType: taskForm.recurrenceType,
              recurrenceInterval: Number(taskForm.recurrenceInterval || 1),
              recurrenceWeekdays: taskForm.recurrenceWeekdays,
              recurrenceDayOfMonth: taskForm.recurrenceDayOfMonth,
              recurrenceMonthlyMode: taskForm.recurrenceMonthlyMode || "day_of_month",
            }
          : applyPresetToSchedule(taskForm.recurrencePreset, taskForm.dueDate, taskForm);

      const created = await createTask(token, {
        projectId: selectedProjectId,
        title: taskForm.title,
        description: taskForm.description,
        priority: taskForm.priority,
        status: taskForm.status,
        assignedTo: taskForm.assignedTo || null,
        dueDate: taskForm.dueDate || null,
        recurrenceType: normalized.recurrenceType,
        recurrenceInterval: Number(normalized.recurrenceInterval || 1),
        recurrenceWeekdays: normalized.recurrenceWeekdays || [],
        recurrenceDayOfMonth: normalized.recurrenceDayOfMonth ? Number(normalized.recurrenceDayOfMonth) : null,
        recurrenceMonthlyMode: normalized.recurrenceMonthlyMode || "day_of_month",
        recurrenceEndAt: taskForm.recurrenceEndAt || null,
      });
      setInfo(created && created.wipWarning ? created.wipWarning.message : "");
      setError("");
      setTaskForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        priority: "low",
        status: "todo",
        dueDate: "",
        recurrencePreset: "one_time",
        recurrenceType: "none",
        recurrenceInterval: 1,
        recurrenceWeekdays: [],
        recurrenceDayOfMonth: "",
        recurrenceMonthlyMode: "day_of_month",
        recurrenceEndAt: "",
      }));
      await refreshTasks();
      await refreshActivity();
      await refreshCalendar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onMove(taskId, status) {
    try {
      const moved = await moveTask(token, taskId, status, Math.floor(Math.random() * 10000));
      setInfo(moved && moved.wipWarning ? moved.wipWarning.message : "");
      setError("");
      await refreshTasks();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onApprove(taskId) {
    try {
      await reviewTask(token, taskId, "approve", "");
      await refreshTasks();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onReject(taskId) {
    try {
      const comment = window.prompt(t("reviewRejectPrompt", "Comment for rejection (optional)"), "") || "";
      await reviewTask(token, taskId, "reject", comment);
      await refreshTasks();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onArchive(taskId, archived = true) {
    try {
      await archiveTask(token, taskId, archived);
      await refreshTasks();
    } catch (e) {
      setError(e.message);
    }
  }

  function onUpdateSchedule(task) {
    const preset = inferPreset(task);
    const draftBase = {
      taskId: task.id,
      title: task.title,
      dueDate: toDateTimeLocalValue(task.due_date),
      recurrencePreset: preset,
      recurrenceType: task.recurrence_type || "none",
      recurrenceInterval: Number(task.recurrence_interval || 1),
      recurrenceWeekdays: task.recurrence_weekdays || [],
      recurrenceDayOfMonth: task.recurrence_day_of_month ? String(task.recurrence_day_of_month) : "",
      recurrenceMonthlyMode: task.recurrence_monthly_mode || "day_of_month",
      recurrenceEndAt: toDateTimeLocalValue(task.recurrence_end_at),
    };
    setScheduleEditor({
      ...draftBase,
      ...(preset === "custom"
        ? {}
        : applyPresetToSchedule(preset, draftBase.dueDate || task.due_date || new Date().toISOString(), draftBase)),
    });
  }

  async function saveScheduleEditor() {
    if (!scheduleEditor) return;
    try {
      const normalized =
        scheduleEditor.recurrencePreset === "custom"
          ? {
              recurrenceType: scheduleEditor.recurrenceType,
              recurrenceInterval: Number(scheduleEditor.recurrenceInterval || 1),
              recurrenceWeekdays: scheduleEditor.recurrenceWeekdays || [],
              recurrenceDayOfMonth: scheduleEditor.recurrenceDayOfMonth || "",
              recurrenceMonthlyMode: scheduleEditor.recurrenceMonthlyMode || "day_of_month",
            }
          : applyPresetToSchedule(
              scheduleEditor.recurrencePreset,
              scheduleEditor.dueDate || new Date().toISOString(),
              scheduleEditor
            );

      await updateTaskSchedule(token, scheduleEditor.taskId, {
        dueDate: scheduleEditor.dueDate || null,
        recurrenceType: normalized.recurrenceType,
        recurrenceInterval: Number(normalized.recurrenceInterval || 1),
        recurrenceWeekdays: normalized.recurrenceWeekdays || [],
        recurrenceDayOfMonth: normalized.recurrenceDayOfMonth ? Number(normalized.recurrenceDayOfMonth) : null,
        recurrenceMonthlyMode: normalized.recurrenceMonthlyMode || "day_of_month",
        recurrenceEndAt: scheduleEditor.recurrenceEndAt || null,
      });
      setScheduleEditor(null);
      await refreshTasks();
      await refreshCalendar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleComments(taskId) {
    if (openCommentTaskId === taskId) return setOpenCommentTaskId("");
    setOpenCommentTaskId(taskId);
    try {
      if (!commentsByTask[taskId]) {
        const commentsData = await listTaskComments(token, taskId);
        setCommentsByTask((curr) => ({ ...curr, [taskId]: commentsData.comments || [] }));
      }
      if (!attachmentsByTask[taskId]) {
        const attachmentsData = await listTaskAttachments(token, taskId);
        setAttachmentsByTask((curr) => ({ ...curr, [taskId]: attachmentsData.attachments || [] }));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitComment(taskId) {
    const draft = (commentDraftByTask[taskId] || "").trim();
    if (!draft) return;
    try {
      const data = await addTaskComment(token, taskId, draft);
      setCommentsByTask((curr) => ({ ...curr, [taskId]: [...(curr[taskId] || []), data.comment] }));
      setCommentDraftByTask((curr) => ({ ...curr, [taskId]: "" }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitAttachment(taskId) {
    const draft = attachmentDraftByTask[taskId] || { fileName: "", fileUrl: "", fileObject: null };
    const fileUrl = String(draft.fileUrl || "").trim();
    const fileName = String(draft.fileName || "").trim();
    const fileObject = draft.fileObject || null;
    if (!fileUrl && !fileObject) return;
    try {
      let payload = { fileName, fileUrl };
      if (fileObject) {
        const fileDataBase64 = await fileToBase64(fileObject);
        payload = {
          fileName,
          fileDataBase64,
          originalFileName: fileObject.name,
          mimeType: fileObject.type || "",
          sizeBytes: fileObject.size || null,
        };
      }
      const data = await addTaskAttachment(token, taskId, payload);
      setAttachmentsByTask((curr) => ({ ...curr, [taskId]: [...(curr[taskId] || []), data.attachment] }));
      setAttachmentDraftByTask((curr) => ({ ...curr, [taskId]: { fileName: "", fileUrl: "", fileObject: null } }));
      pushToast(t("attachmentAdded", "Attachment added"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeAttachment(taskId, attachmentId) {
    try {
      await deleteTaskAttachment(token, taskId, attachmentId);
      setAttachmentsByTask((curr) => ({
        ...curr,
        [taskId]: (curr[taskId] || []).filter((x) => x.id !== attachmentId),
      }));
      pushToast(t("attachmentRemoved", "Attachment removed"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDragEnd(event) {
    setActiveTaskId("");
    const { active, over } = event;
    if (!active || !over) return;
    const activeId = String(active.id).replace("task:", "");
    const activeItem = tasks.find((t) => t.id === activeId);
    if (!activeItem) return;

    let targetStatus = "";
    const overId = String(over.id);
    if (overId.startsWith("col:")) targetStatus = overId.replace("col:", "");
    if (overId.startsWith("task:")) {
      const overTask = tasks.find((t) => t.id === overId.replace("task:", ""));
      targetStatus = overTask ? overTask.status : "";
    }
    if (!targetStatus || targetStatus === activeItem.status) return;
    await onMove(activeItem.id, targetStatus);
  }

  useEffect(() => {
    if (!pendingTaskDeepLinkId || !tasks.length) return;
    const match = tasks.find((task) => task.id === pendingTaskDeepLinkId);
    if (!match) return;
    openTaskPanel(match.id, match.title, match.status).finally(() => {
      setPendingTaskDeepLinkId("");
      const url = new URL(window.location.href);
      url.searchParams.delete("task");
      window.history.replaceState(null, "", url.toString());
    });
  }, [pendingTaskDeepLinkId, tasks]);

  async function onReadNotification(notificationId) {
    try {
      await markNotificationRead(token, notificationId);
      setNotifications((curr) => {
        const wasUnread = curr.some((n) => n.id === notificationId && !n.is_read);
        if (wasUnread) setNotifUnread((count) => Math.max(0, count - 1));
        return curr.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n));
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function onSaveNotificationPreferences() {
    try {
      const payload = {
        inAppEnabled: Boolean(notificationPrefs.in_app_enabled),
        whatsappEnabled: Boolean(notificationPrefs.whatsapp_enabled),
        quietHoursEnabled: Boolean(notificationPrefs.quiet_hours_enabled),
        quietHoursStart: Number(notificationPrefs.quiet_hours_start),
        quietHoursEnd: Number(notificationPrefs.quiet_hours_end),
        timezoneOffsetMinutes: Number(notificationPrefs.timezone_offset_minutes),
      };
      const data = await updateNotificationPreferences(token, payload);
      if (data && data.preferences) setNotificationPrefs(data.preferences);
      setInfo(t("notificationPrefsUpdated", "Notification preferences updated."));
      pushToast(t("notificationPrefsSaved", "Notification preferences saved"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onReadAllNotifications() {
    try {
      await markAllNotificationsRead(token);
      setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true })));
      setNotifUnread(0);
      pushToast(t("allReadDone", "All notifications marked as read"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onClearReadNotifications() {
    try {
      await clearReadNotifications(token, 14);
      await refreshNotifications();
      pushToast(t("readCleared", "Old read notifications cleared"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function openTaskPanel(taskId, taskTitle = "", taskStatus = "") {
    if (!taskId) return;

    const nextSearch = taskTitle || "";
    const nextStatus = ["todo", "in_progress", "done"].includes(taskStatus) ? taskStatus : "";
    setViewMode("board");
    setSearch(nextSearch);
    setStatusFilter(nextStatus);
    setReviewFilter("");
    setDueFilter("");
    setSlaFilter("");
    setShowNotifPanel(false);

    try {
      await refreshTasks(selectedProjectId, {
        search: nextSearch,
        status: nextStatus,
        review: "",
        assigneeId: currentUser && currentUser.role === "employee" ? currentUser.id : assigneeFilter,
        includeArchived,
      });
      const commentsData = await listTaskComments(token, taskId);
      setCommentsByTask((curr) => ({ ...curr, [taskId]: commentsData.comments || [] }));
      const attachmentsData = await listTaskAttachments(token, taskId);
      setAttachmentsByTask((curr) => ({ ...curr, [taskId]: attachmentsData.attachments || [] }));
      setOpenCommentTaskId(taskId);
      pushToast(t("taskOpened", "Task opened"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function openTaskFromNotification(notification) {
    const taskId = notification && notification.task_id ? String(notification.task_id) : "";
    const taskTitle = notification && notification.task_title ? String(notification.task_title) : "";
    const taskStatus = notification && notification.task_status ? String(notification.task_status) : "";
    await openTaskPanel(taskId, taskTitle, taskStatus);
  }

  async function copyTaskLink(task) {
    if (!task || !task.id) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", selectedProjectId);
      url.searchParams.set("task", task.id);
      await navigator.clipboard.writeText(url.toString());
      pushToast(t("taskLinkCopied", "Task link copied"), "info");
    } catch {
      setError(t("couldNotCopyTaskLink", "Could not copy task link"));
    }
  }

  async function approveTaskFromNotification(notification) {
    const taskId = notification && notification.task_id ? String(notification.task_id) : "";
    if (!taskId || !isPrivileged) return;
    try {
      await reviewTask(token, taskId, "approve", "");
      await onReadNotification(notification.id);
      await refreshTasks();
      pushToast(t("taskApproved", "Task approved"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function rejectTaskFromNotification(notification) {
    const taskId = notification && notification.task_id ? String(notification.task_id) : "";
    if (!taskId || !isPrivileged) return;
    const comment = window.prompt(t("reviewRejectPrompt", "Comment for rejection (optional)"), "") || "";
    try {
      await reviewTask(token, taskId, "reject", comment);
      await onReadNotification(notification.id);
      await refreshTasks();
      pushToast(t("taskRejected", "Task rejected"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  function applyNotifFocus(mode) {
    setViewMode("board");
    if (mode === "review_queue") {
      setActiveQuickFilter("review");
      setStatusFilter("done");
      setReviewFilter("pending");
      setDueFilter("");
      setSlaFilter("");
      setNotifTab("critical");
      setShowNotifPanel(false);
      pushToast(t("openedReviewQueue", "Opened review queue"), "info");
      return;
    }
    if (mode === "sla_escalated") {
      setActiveQuickFilter("escalated");
      setStatusFilter("");
      setReviewFilter("");
      setDueFilter("");
      setSlaFilter("sla_escalated");
      setNotifTab("critical");
      setShowNotifPanel(false);
      pushToast(t("openedSlaEscalations", "Opened SLA escalations"), "info");
    }
  }

  async function onCreateAssistantSkill(event) {
    event.preventDefault();
    try {
      const roles = Object.entries(assistantSkillForm.roles)
        .filter(([, enabled]) => enabled)
        .map(([role]) => role);
      const payload = {
        skillKey: assistantSkillForm.skillKey,
        title: assistantSkillForm.title,
        description: assistantSkillForm.description,
        querySql: assistantSkillForm.querySql,
        roles,
      };
      await createAssistantSkill(token, payload);
      setAssistantSkillForm((curr) => ({ ...curr, skillKey: "", title: "", description: "" }));
      await refreshAssistantAdminData();
      pushToast(t("assistantSkillCreated", "Assistant skill created"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onSaveSlaPolicy() {
    try {
      const payload = {
        enabled: Boolean(slaPolicy.enabled),
        defaultHours: Number(slaPolicy.defaultHours || 1),
        repeatHours: Number(slaPolicy.repeatHours || 1),
        maxReminders: Number(slaPolicy.maxReminders || 1),
        escalationHours: Number(slaPolicy.escalationHours || 1),
        scanEverySeconds: Number(slaPolicy.scanEverySeconds || 30),
      };
      const data = await updateSlaPolicy(token, payload);
      if (data && data.policy) setSlaPolicy(data.policy);
      setInfo(t("slaPolicyUpdated", "SLA policy updated."));
      pushToast(t("slaPolicySaved", "SLA policy saved"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRequeueWhatsapp(queueId) {
    try {
      await requeueWhatsappMessage(token, queueId);
      await refreshWhatsappOps();
      pushToast(t("whatsappRequeued", "WhatsApp message requeued"), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDecideSkillApproval(approvalId, status) {
    try {
      await decideAssistantSkillApproval(token, approvalId, status, "");
      await refreshAssistantAdminData();
      pushToast(t("skillRequestStatus", "Skill request {status}", { status }), "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onExportIcs() {
    try {
      const ics = await downloadCalendarIcs(
        token,
        selectedProjectId,
        monthRange.from.toISOString(),
        monthRange.to.toISOString()
      );
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `listo-${selectedProjectId}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!token) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <div className="topbar-row">
            <div className="view-switch">
              <button type="button" className={lang === "bg" ? "active" : ""} onClick={() => setUiLang("bg")}>BG</button>
              <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setUiLang("en")}>EN</button>
            </div>
          </div>
          <div className="auth-brand">
            <div className="logo-mark auth-logo-mark">
              <ListoMark />
            </div>
            <div>
              <h1 className="brand-wordmark">list<span>O</span></h1>
              <p>{t("authSubtitle", "Sign in to open your board. API status: {status}", { status: healthLabel(healthState, t) })}</p>
            </div>
          </div>
          <div className="demo-login-row">
            {DEMO_USERS.map((user) => (
              <button key={user.key} type="button" className="ghost-btn" onClick={() => useDemoAccount(user.key)}>
                {roleLabel(user.key, t)}
              </button>
            ))}
          </div>
          <form onSubmit={onLogin}>
            <label>{t("email", "Email")}</label>
            <input
              type="email"
              placeholder="name@company.com"
              value={authForm.email}
              onChange={(e) => setAuthForm((x) => ({ ...x, email: e.target.value }))}
              required
            />
            <label>{t("password", "Password")}</label>
            <input
              type="password"
              placeholder="••••••••"
              value={authForm.password}
              onChange={(e) => setAuthForm((x) => ({ ...x, password: e.target.value }))}
              required
            />
            <button type="submit">{t("signIn", "Sign in")}</button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={`shell density-${density}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <div className="logo-mark">
            <ListoMark />
          </div>
          <div className="topbar-copy">
            <h1 className="brand-wordmark">list<span>O</span></h1>
            <small className="brand-subtitle">{isEmployee ? t("myTasks", "My Tasks") : t("boardControl", "Board Control")}</small>
            <div className="topbar-meta">
              <span className="topbar-chip">{currentUser ? roleLabel(currentUser.role, t) : "..."}</span>
              <span className="topbar-chip">{t("projectsCount", "{count} projects", { count: projects.length })}</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="topbar-row">
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div className="view-switch">
              <button type="button" onClick={() => setViewMode("board")} className={viewMode === "board" ? "active" : ""}>{t("board", "Board")}</button>
              <button type="button" onClick={() => setViewMode("calendar")} className={viewMode === "calendar" ? "active" : ""}>{t("calendar", "Calendar")}</button>
            </div>
            <div className="view-switch">
              <button type="button" className={lang === "bg" ? "active" : ""} onClick={() => setUiLang("bg")}>BG</button>
              <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setUiLang("en")}>EN</button>
            </div>
          </div>
          <p>
            {t("signedInAs", "Signed in as {name}", {
              name: currentUser ? `${currentUser.name} (${roleLabel(currentUser.role, t)})` : t("loading", "loading..."),
            })}
          </p>
          <small className="shortcut-hint">{t("shortcuts", "Shortcuts: N new task, / search, B board, C calendar")}</small>
          <div className="topbar-row topbar-row-cta">
            <button type="button" className="ghost-btn" onClick={() => setDensity((x) => (x === "comfortable" ? "compact" : "comfortable"))}>
              {t("density", "Density: {value}", { value: t(density, density) })}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowNotifPanel((x) => !x)}>{t("notifications", "Notifications")} ({notifUnread})</button>
            <button type="button" className="danger-btn" onClick={() => setToken("")}>{t("logout", "Logout")}</button>
          </div>
          {showNotifPanel ? (
            <div className="notif-panel card">
              <h3>{t("notifications", "Notifications")}</h3>
              <div className="notif-summary">
                <span className="notif-pill">{notificationSummary.unread} {t("unread", "unread")}</span>
                <span className="notif-pill notif-pill-critical">{notificationSummary.criticalUnread} {t("critical", "critical")}</span>
                <span className="notif-pill notif-pill-warn">{notificationSummary.reviewUnread} {t("review", "review")}</span>
              </div>
              {isPrivileged ? (
                <div className="notif-quick-actions">
                  <button type="button" className="secondary-btn" onClick={() => applyNotifFocus("review_queue")}>{t("openReviewQueue", "Open Review Queue")}</button>
                  <button type="button" className="ghost-btn" onClick={() => applyNotifFocus("sla_escalated")}>{t("openSlaEscalations", "Open SLA Escalations")}</button>
                </div>
              ) : null}
              <div className="notif-tabs">
                <button type="button" className={notifTab === "unread" ? "active" : ""} onClick={() => setNotifTab("unread")}>{t("unread", "Unread")}</button>
                <button type="button" className={notifTab === "all" ? "active" : ""} onClick={() => setNotifTab("all")}>{t("all", "All")}</button>
                <button type="button" className={notifTab === "critical" ? "active" : ""} onClick={() => setNotifTab("critical")}>{t("critical", "Critical")}</button>
                <button type="button" className={notifTab === "mentions" ? "active" : ""} onClick={() => setNotifTab("mentions")}>{t("mentions", "Mentions")}</button>
              </div>
              <div className="notif-actions">
                <button type="button" className="secondary-btn" onClick={onReadAllNotifications}>{t("markAllRead", "Mark all read")}</button>
                <button type="button" className="ghost-btn" onClick={onClearReadNotifications}>{t("clearOldRead", "Clear old read")}</button>
              </div>
              <div className="notif-prefs">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.in_app_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, in_app_enabled: e.target.checked }))}
                  />
                  {t("inAppEnabled", "In-app enabled")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.whatsapp_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, whatsapp_enabled: e.target.checked }))}
                  />
                  {t("whatsappEnabled", "WhatsApp enabled")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.quiet_hours_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, quiet_hours_enabled: e.target.checked }))}
                  />
                  {t("quietHours", "Quiet hours")}
                </label>
                <div className="notif-prefs-grid">
                  <div>
                    <small>{t("quietFrom", "Quiet from (hour)")}</small>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={notificationPrefs.quiet_hours_start}
                      onChange={(e) =>
                        setNotificationPrefs((curr) => ({ ...curr, quiet_hours_start: Number(e.target.value || 0) }))
                      }
                    />
                  </div>
                  <div>
                    <small>{t("quietTo", "Quiet to (hour)")}</small>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={notificationPrefs.quiet_hours_end}
                      onChange={(e) =>
                        setNotificationPrefs((curr) => ({ ...curr, quiet_hours_end: Number(e.target.value || 0) }))
                      }
                    />
                  </div>
                </div>
                <button type="button" className="secondary-btn" onClick={onSaveNotificationPreferences}>{t("savePrefs", "Save preferences")}</button>
              </div>
              {groupedVisibleNotifications.map((group) => (
                <section key={group.key} className="notif-group">
                  <h4 className={`notif-group-title notif-group-${group.severity}`}>
                    {group.label} ({group.items.length})
                  </h4>
                  {group.items.map((n) => (
                    <div key={n.id} className={`notif-item notif-item-${getNotificationMeta(n.type, (type, fallback) => notificationTypeLabel(type, t, fallback)).severity} ${n.is_read ? "" : "notif-unread"}`}>
                      <strong>{n.title}</strong>
                      <p>{n.message}</p>
                      <small>{new Date(n.created_at).toLocaleString(locale)}</small>
                      <div className="notif-item-actions">
                        {n.task_id ? (
                          <button type="button" className="ghost-btn" onClick={() => openTaskFromNotification(n)}>
                            {t("notifOpenTask", "Open task")}
                          </button>
                        ) : null}
                        {isPrivileged && n.task_id && ["task.done.pending_review", "task.review.reminder"].includes(n.type) ? (
                          <>
                            <button type="button" className="secondary-btn" onClick={() => approveTaskFromNotification(n)}>
                              {t("approve", "Approve")}
                            </button>
                            <button type="button" className="danger-btn" onClick={() => rejectTaskFromNotification(n)}>
                              {t("reject", "Reject")}
                            </button>
                          </>
                        ) : null}
                        {!n.is_read ? <button type="button" onClick={() => onReadNotification(n.id)}>{t("markRead", "Mark read")}</button> : null}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
              {groupedVisibleNotifications.length === 0 ? <p className="section-note">{t("noNotificationsTab", "No notifications in this tab.")}</p> : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="kpi-grid">
        {[
          { key: "active", label: t("kpiActive", "Active"), value: kpis.active },
          { key: "overdue", label: t("kpiOverdue", "Overdue"), value: kpis.overdue },
          { key: "pendingReviewLate", label: t("kpiReviewLate", "Review SLA >24h"), value: kpis.pendingReviewLate },
          { key: "slaOverdue", label: t("kpiSlaOverdue", "SLA Overdue"), value: kpis.slaOverdue },
          { key: "slaEscalated", label: t("kpiSlaEscalated", "SLA Escalated"), value: kpis.slaEscalated },
          { key: "archived", label: t("kpiArchived", "Archived"), value: kpis.archived },
        ].map((item) => (
          <article
            key={item.key}
            className="card kpi-item"
            role="button"
            tabIndex={0}
            onClick={() => onKpiNavigate(item.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onKpiNavigate(item.key);
              }
            }}
            title={t("openMetric", "Open {label}", { label: item.label })}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {isPrivileged ? (
        <section ref={adminInboxRef} className="card admin-inbox">
          <div className="admin-inbox-head">
            <h2>{t("adminInbox", "Admin Inbox")}</h2>
            <small>{t("adminInboxNote", "Fast action queue for review and escalations")}</small>
          </div>
          <div className="admin-inbox-grid">
            <article>
              <h3>{t("pendingReview", "Pending Review")} ({adminInbox.reviewQueue.length})</h3>
              {adminInbox.reviewQueue.slice(0, 5).map((task) => (
                <div key={task.id} className="admin-inbox-item">
                  <strong>{task.title}</strong>
                  <small>{t("assignee", "assignee")}: {task.assigned_to ? memberNameById[task.assigned_to] || t("unknown", "Unknown") : t("unassigned", "Unassigned")}</small>
                  <div className="admin-inbox-actions">
                    <button type="button" className="ghost-btn" onClick={() => openTaskPanel(task.id, task.title, task.status)}>{t("notifOpenTask", "Open task")}</button>
                    <button type="button" className="secondary-btn" onClick={() => onApprove(task.id)}>{t("approve", "Approve")}</button>
                    <button type="button" className="danger-btn" onClick={() => onReject(task.id)}>{t("reject", "Reject")}</button>
                  </div>
                </div>
              ))}
              {adminInbox.reviewQueue.length === 0 ? <p className="section-note">{t("noPendingReview", "No pending review tasks.")}</p> : null}
            </article>
            <article>
              <h3>{t("escalatedSla", "SLA Escalated")} ({adminInbox.slaEscalated.length})</h3>
              {adminInbox.slaEscalated.slice(0, 5).map((task) => (
                <div key={task.id} className="admin-inbox-item">
                  <strong>{task.title}</strong>
                  <small>{t("statusText", "status")}: {statusLabel(task.status, t)}</small>
                  <div className="admin-inbox-actions">
                    <button type="button" className="ghost-btn" onClick={() => openTaskPanel(task.id, task.title, task.status)}>{t("notifOpenTask", "Open task")}</button>
                    {task.status === "done" && task.review_status === "pending" ? (
                      <button type="button" className="secondary-btn" onClick={() => onApprove(task.id)}>{t("approve", "Approve")}</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {adminInbox.slaEscalated.length === 0 ? <p className="section-note">{t("noEscalatedSla", "No escalated SLA tasks.")}</p> : null}
            </article>
          </div>
        </section>
      ) : null}

      <section className="card saved-views">
        <h2>{t("savedViews", "Saved Views")}</h2>
        <div className="saved-views-row">
          <select value={activeSavedViewId} onChange={(e) => applySavedView(e.target.value)}>
            <option value="">{t("selectView", "Select view")}</option>
            {availableSavedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {savedViewLabel(view, t)}{view.readOnly ? ` ${t("defaultTag", "(default)")}` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder={t("saveCurrentAs", "Save current as...")}
            value={savedViewName}
            onChange={(e) => setSavedViewName(e.target.value)}
          />
          <button type="button" className="ghost-btn" onClick={saveCurrentView}>{t("saveView", "Save view")}</button>
          <button type="button" className="ghost-btn" onClick={deleteActiveCustomView}>{t("deleteView", "Delete view")}</button>
        </div>
      </section>

      <section className="card quick-filters">
        <h2>{t("quickFilters", "Quick Filters")}</h2>
        <div className="quick-filters-row">
          {quickFilters.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`ghost-btn ${activeQuickFilter === preset.key ? "active-chip" : ""}`}
              onClick={() => applyQuickFilter(preset.key)}
            >
              {quickFilterLabel(preset.key, preset.label, t)}
            </button>
          ))}
          <button type="button" className={`ghost-btn ${activeQuickFilter === "custom" ? "active-chip" : ""}`} onClick={() => setActiveQuickFilter("custom")}>
            {t("custom", "Custom")}
          </button>
        </div>
      </section>

      {isPrivileged ? (
        <section className="card sla-policy-admin">
          <h2>{t("slaPolicy", "SLA Policy")}</h2>
          <p className="section-note">{t("slaPolicyNote", "Live settings for reminder cadence. Changes apply without API restart.")}</p>
          <div className="sla-policy-grid">
            <label>
              <input
                type="checkbox"
                checked={Boolean(slaPolicy.enabled)}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, enabled: e.target.checked }))}
              />
              {t("enabled", "Enabled")}
            </label>
            <label>
              {t("defaultSlaHours", "Default SLA (hours)")}
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.defaultHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, defaultHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              {t("repeatEveryHours", "Repeat every (hours)")}
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.repeatHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, repeatHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              {t("maxRemindersTask", "Max reminders per task")}
              <input
                type="number"
                min="1"
                max="50"
                value={slaPolicy.maxReminders}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, maxReminders: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              {t("escalationDelayHours", "Escalation delay (hours)")}
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.escalationHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, escalationHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              {t("scanIntervalSeconds", "Scan interval (seconds)")}
              <input
                type="number"
                min="30"
                max="3600"
                value={slaPolicy.scanEverySeconds}
                onChange={(e) =>
                  setSlaPolicy((curr) => ({ ...curr, scanEverySeconds: Number(e.target.value || 30) }))
                }
              />
            </label>
          </div>
          <button type="button" className="secondary-btn" onClick={onSaveSlaPolicy}>{t("saveSlaPolicy", "Save SLA policy")}</button>
        </section>
      ) : null}

      {isPrivileged ? (
        <section className="card assistant-admin">
          <h2>{t("assistantSkillsAdmin", "Assistant Skills Admin")}</h2>
          <p className="section-note">{t("assistantSkillsNote", "Create dynamic SQL skills and approve pending access requests.")}</p>
          <form className="assistant-skill-form" onSubmit={onCreateAssistantSkill}>
            <input
              placeholder={t("skillKeyPlaceholder", "skill key (e.g. overdue-mine)")}
              value={assistantSkillForm.skillKey}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, skillKey: e.target.value }))}
              required
            />
            <input
              placeholder={t("titlePlaceholder", "title")}
              value={assistantSkillForm.title}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, title: e.target.value }))}
              required
            />
            <input
              placeholder={t("descriptionPlaceholder", "description")}
              value={assistantSkillForm.description}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, description: e.target.value }))}
            />
            <textarea
              placeholder={t("safeSelectSql", "Safe SELECT SQL")}
              value={assistantSkillForm.querySql}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, querySql: e.target.value }))}
              required
            />
            <div className="assistant-roles">
              <label><input type="checkbox" checked={assistantSkillForm.roles.employee} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, employee: e.target.checked } }))} /> {roleLabel("employee", t)}</label>
              <label><input type="checkbox" checked={assistantSkillForm.roles.manager} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, manager: e.target.checked } }))} /> {roleLabel("manager", t)}</label>
              <label><input type="checkbox" checked={assistantSkillForm.roles.admin} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, admin: e.target.checked } }))} /> {roleLabel("admin", t)}</label>
            </div>
            <button type="submit">{t("createSkill", "Create skill")}</button>
          </form>
          <div className="assistant-grid">
            <article>
              <h3>{t("dynamicSkills", "Dynamic Skills")}</h3>
              {assistantSkills.map((skill) => (
                <div key={skill.id || skill.skill_key} className="assistant-item">
                  <strong>{skill.skill_key || skill.key}</strong>
                  <small>{skill.title}</small>
                </div>
              ))}
            </article>
            <article>
              <h3>{t("pendingApprovals", "Pending Approvals")}</h3>
              {assistantApprovals.length === 0 ? <p>{t("noPendingApprovals", "No pending approvals.")}</p> : null}
              {assistantApprovals.map((approval) => (
                <div key={approval.id} className="assistant-item">
                  <strong>{approval.skill_key}</strong>
                  <small>{approval.user_email}</small>
                  <div className="assistant-item-actions">
                    <button type="button" className="secondary-btn" onClick={() => onDecideSkillApproval(approval.id, "approved")}>{t("approve", "Approve")}</button>
                    <button type="button" className="danger-btn" onClick={() => onDecideSkillApproval(approval.id, "rejected")}>{t("reject", "Reject")}</button>
                  </div>
                </div>
              ))}
            </article>
          </div>
        </section>
      ) : null}

      {isPrivileged ? (
        <section className="card assistant-admin">
          <h2>{t("whatsappQueue", "WhatsApp Delivery Queue")}</h2>
          <p className="section-note">{t("whatsappQueueNote", "Monitor outbound retries and manually requeue failed messages.")}</p>
          <div className="queue-toolbar">
            <select value={whatsappQueueFilter} onChange={(e) => setWhatsappQueueFilter(e.target.value)}>
              <option value="">{t("queueAll", "all")}</option>
              <option value="failed">{t("queueFailed", "failed")}</option>
              <option value="pending">{t("queuePending", "pending")}</option>
              <option value="sent">{t("queueSent", "sent")}</option>
            </select>
            <button type="button" className="secondary-btn" onClick={() => refreshWhatsappOps().catch((e) => setError(e.message))}>
              {t("refresh", "Refresh")}
            </button>
          </div>
          <div className="queue-metrics">
            <article className="queue-metric-card">
              <small>{t("queuePendingLabel", "Pending")}</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.pending_count : 0}</strong>
            </article>
            <article className="queue-metric-card">
              <small>{t("queueFailedLabel", "Failed")}</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.failed_count : 0}</strong>
            </article>
            <article className="queue-metric-card">
              <small>{t("queueSentLabel", "Sent")}</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.sent_count : 0}</strong>
            </article>
          </div>
          <div className="queue-list">
            {whatsappQueue.length === 0 ? <p className="queue-empty">{t("queueEmpty", "No queue messages for this filter.")}</p> : null}
            {whatsappQueue.map((item) => {
              const errorMeta = parseQueueError(item.last_error);
              return (
                <div key={item.id} className={`queue-item queue-item-${String(item.status || "pending")}`}>
                  <div className="queue-item-topline">
                    <div className="queue-item-head">
                      <span className={`queue-status queue-status-${String(item.status || "pending")}`}>{queueStatusLabel(String(item.status || "pending"), t)}</span>
                      <strong className="queue-recipient">{item.recipient || t("unknownRecipient", "Unknown recipient")}</strong>
                    </div>
                    <small className="queue-created">{t("created", "Created")} {formatQueueDate(item.created_at, locale)}</small>
                  </div>
                  <div className="queue-item-meta">
                    <div>
                      <small>{t("attempts", "Attempts")}</small>
                      <strong>{item.attempts}/{item.max_attempts}</strong>
                    </div>
                    <div>
                      <small>{t("nextRetry", "Next Retry")}</small>
                      <strong>{formatQueueDate(item.next_attempt_at, locale)}</strong>
                    </div>
                    <div>
                      <small>{t("lastSent", "Last Sent")}</small>
                      <strong>{item.sent_at ? formatQueueDate(item.sent_at, locale) : "-"}</strong>
                    </div>
                  </div>
                  {errorMeta ? (
                    <div className="queue-error">
                      <p title={errorMeta.message}>{errorMeta.message}</p>
                      <div className="queue-error-meta">
                        {errorMeta.type ? <small>Type {errorMeta.type}</small> : null}
                        {errorMeta.code ? <small>Code {errorMeta.code}</small> : null}
                        {errorMeta.trace ? <small>Trace {errorMeta.trace}</small> : null}
                      </div>
                      {queueErrorHint(errorMeta, t) ? <small className="queue-error-hint">{queueErrorHint(errorMeta, t)}</small> : null}
                    </div>
                  ) : null}
                  {item.status === "failed" ? (
                    <div className="queue-actions">
                      <button type="button" className="secondary-btn" onClick={() => onRequeueWhatsapp(item.id)}>{t("requeueNow", "Requeue now")}</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section ref={filterBarRef} className="card filter-bar">
        <input
          ref={searchInputRef}
          placeholder={t("filterSearch", "Search title/description")}
          value={search}
          onChange={(e) => {
            setActiveQuickFilter("custom");
            setSearch(e.target.value);
          }}
        />
        <select value={statusFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setStatusFilter(e.target.value);
        }}>
          <option value="">{t("filterAllStatus", "All status")}</option>
          <option value="todo">{statusLabel("todo", t)}</option><option value="in_progress">{statusLabel("in_progress", t)}</option><option value="done">{statusLabel("done", t)}</option>
        </select>
        <select value={reviewFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setReviewFilter(e.target.value);
        }}>
          <option value="">{t("filterAllReview", "All review")}</option>
          <option value="pending">{reviewStatusLabel("pending", t)}</option><option value="approved">{reviewStatusLabel("approved", t)}</option><option value="rejected">{reviewStatusLabel("rejected", t)}</option>
        </select>
        {isEmployee ? (
          <input value={t("assigneeMe", "Assignee: me")} disabled />
        ) : (
          <select value={assigneeFilter} onChange={(e) => {
            setActiveQuickFilter("custom");
            setAssigneeFilter(e.target.value);
          }}>
            <option value="">{t("filterAllAssignees", "All assignees")}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        )}
        <select value={dueFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setDueFilter(e.target.value);
        }}>
          <option value="">{t("filterAllDue", "All due states")}</option>
          <option value="overdue">{dueFilterLabel("overdue", t)}</option>
          <option value="review_late">{dueFilterLabel("review_late", t)}</option>
          <option value="today">{dueFilterLabel("today", t)}</option>
          <option value="week">{dueFilterLabel("week", t)}</option>
          <option value="none">{dueFilterLabel("none", t)}</option>
        </select>
        <select value={slaFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setSlaFilter(e.target.value);
        }}>
          <option value="">{t("filterAllSla", "All SLA states")}</option>
          <option value="sla_overdue">{t("kpiSlaOverdue", "sla overdue")}</option>
          <option value="sla_escalated">{t("kpiSlaEscalated", "sla escalated")}</option>
        </select>
        <label className="archive-toggle">
          <input type="checkbox" checked={includeArchived} onChange={(e) => {
            setActiveQuickFilter("custom");
            setIncludeArchived(e.target.checked);
          }} /> {t("showArchived", "Show archived")}
        </label>
      </section>

      <section className="card composer">
        <h2>{t("quickAddTask", "Quick add task")}</h2>
        <p className="section-note">{isEmployee ? t("employeeComposerNote", "Create and track only your own tasks.") : t("managerComposerNote", "Set assignee, due date and schedule in one flow.")}</p>
        <form onSubmit={onCreateTask} className="grid-form">
          <input
            ref={taskTitleInputRef}
            placeholder={t("taskTitle", "Task title")}
            value={taskForm.title}
            onChange={(e) => setTaskForm((x) => ({ ...x, title: e.target.value }))}
            required
          />
          <input placeholder={t("description", "Description")} value={taskForm.description} onChange={(e) => setTaskForm((x) => ({ ...x, description: e.target.value }))} />
          <select value={taskForm.priority} onChange={(e) => setTaskForm((x) => ({ ...x, priority: e.target.value }))}>
            <option value="low">{priorityLabel("low", t)}</option><option value="medium">{priorityLabel("medium", t)}</option><option value="high">{priorityLabel("high", t)}</option>
          </select>
          <select value={taskForm.status} onChange={(e) => setTaskForm((x) => ({ ...x, status: e.target.value }))}>
            <option value="todo">{statusLabel("todo", t)}</option><option value="in_progress">{statusLabel("in_progress", t)}</option><option value="done">{statusLabel("done", t)}</option>
          </select>
          {isEmployee ? (
            <input value={t("assignedToLabel", "Assigned to: {name}", { name: currentUser ? currentUser.name : "me" })} disabled />
          ) : (
            <select value={taskForm.assignedTo} onChange={(e) => setTaskForm((x) => ({ ...x, assignedTo: e.target.value }))}>
              <option value="">{t("unassigned", "Unassigned")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name} ({roleLabel(member.role, t)})</option>
              ))}
            </select>
          )}
          <button type="submit">{t("create", "Create")}</button>

          <input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm((x) => ({ ...x, dueDate: e.target.value }))} />
          <select
            value={taskForm.recurrencePreset}
            onChange={(e) => {
              const preset = e.target.value;
              setTaskForm((x) => ({
                ...x,
                recurrencePreset: preset,
                ...applyPresetToSchedule(preset, x.dueDate, x),
              }));
            }}
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{schedulePresetLabel(preset.key, t)}</option>
            ))}
          </select>
          {taskForm.recurrencePreset === "custom" ? (
            <>
              <select value={taskForm.recurrenceType} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceType: e.target.value }))}>
                <option value="none">{t("recurrenceNone", "one-time")}</option>
                <option value="daily">{t("recurrenceDaily", "daily")}</option>
                <option value="weekly">{t("recurrenceWeekly", "weekly")}</option>
                <option value="monthly">{t("recurrenceMonthly", "monthly")}</option>
              </select>
              <input
                type="number"
                min="1"
                max="365"
                value={taskForm.recurrenceInterval}
                onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceInterval: e.target.value }))}
                placeholder={t("interval", "interval")}
              />
              {taskForm.recurrenceType === "weekly" ? (
                <select
                  multiple
                  value={taskForm.recurrenceWeekdays}
                  onChange={(e) =>
                    setTaskForm((x) => ({
                      ...x,
                      recurrenceWeekdays: Array.from(e.target.selectedOptions).map((o) => o.value),
                    }))
                  }
                >
                  {WEEKDAY_OPTIONS.map((wd) => (
                    <option key={wd} value={wd}>{weekdayLabel(wd, t)}</option>
                  ))}
                </select>
              ) : taskForm.recurrenceType === "monthly" ? (
                <select
                  value={taskForm.recurrenceMonthlyMode}
                  onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceMonthlyMode: e.target.value }))}
                >
                  <option value="day_of_month">{t("dayOfMonth", "day of month")}</option>
                  <option value="last_business_day">{t("lastBusinessDay", "last business day")}</option>
                </select>
              ) : (
                <input disabled value="-" />
              )}
              {taskForm.recurrenceType === "monthly" && taskForm.recurrenceMonthlyMode === "day_of_month" ? (
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder={t("dayOfMonth", "day-of-month")}
                  value={taskForm.recurrenceDayOfMonth}
                  onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceDayOfMonth: e.target.value }))}
                />
              ) : (
                <input type="datetime-local" value={taskForm.recurrenceEndAt} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceEndAt: e.target.value }))} />
              )}
            </>
          ) : (
            <>
              <input disabled value={t("presetLabel", "Preset: {label}", { label: schedulePresetLabel(taskForm.recurrencePreset, t) })} />
              <input type="datetime-local" value={taskForm.recurrenceEndAt} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceEndAt: e.target.value }))} />
              <input disabled value={t("ruleInterval", "Rule interval: {value}", { value: taskForm.recurrenceInterval })} />
              <input disabled value={taskForm.recurrenceWeekdays.join(",") || taskForm.recurrenceMonthlyMode || "-"} />
            </>
          )}
        </form>
      </section>

      {scheduleEditor ? (
        <section className="card schedule-editor">
          <h3>{t("scheduleTask", "Schedule task: {title}", { title: scheduleEditor.title })}</h3>
          <div className="schedule-grid">
            <input
              type="datetime-local"
              value={scheduleEditor.dueDate}
              onChange={(e) => setScheduleEditor((x) => ({ ...x, dueDate: e.target.value }))}
            />
            <select
              value={scheduleEditor.recurrencePreset}
              onChange={(e) =>
                setScheduleEditor((x) => {
                  const preset = e.target.value;
                  return {
                    ...x,
                    recurrencePreset: preset,
                    ...(preset === "custom"
                      ? {}
                      : applyPresetToSchedule(preset, x.dueDate || new Date().toISOString(), x)),
                  };
                })
              }
            >
              {SCHEDULE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>{schedulePresetLabel(preset.key, t)}</option>
              ))}
            </select>
            {scheduleEditor.recurrencePreset === "custom" ? (
              <>
                <select
                  value={scheduleEditor.recurrenceType}
                  onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceType: e.target.value }))}
                >
                  <option value="none">{t("recurrenceNone", "one-time")}</option>
                  <option value="daily">{t("recurrenceDaily", "daily")}</option>
                  <option value="weekly">{t("recurrenceWeekly", "weekly")}</option>
                  <option value="monthly">{t("recurrenceMonthly", "monthly")}</option>
                </select>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={scheduleEditor.recurrenceInterval}
                  onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceInterval: e.target.value }))}
                />
                {scheduleEditor.recurrenceType === "weekly" ? (
                  <select
                    multiple
                    value={scheduleEditor.recurrenceWeekdays}
                    onChange={(e) =>
                      setScheduleEditor((x) => ({
                        ...x,
                        recurrenceWeekdays: Array.from(e.target.selectedOptions).map((o) => o.value),
                      }))
                    }
                  >
                    {WEEKDAY_OPTIONS.map((wd) => (
                      <option key={wd} value={wd}>{weekdayLabel(wd, t)}</option>
                    ))}
                  </select>
                ) : scheduleEditor.recurrenceType === "monthly" ? (
                  <select
                    value={scheduleEditor.recurrenceMonthlyMode}
                    onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceMonthlyMode: e.target.value }))}
                  >
                    <option value="day_of_month">{t("dayOfMonth", "day of month")}</option>
                    <option value="last_business_day">{t("lastBusinessDay", "last business day")}</option>
                  </select>
                ) : (
                  <input disabled value={t("noExtraRule", "no extra rule")} />
                )}
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={scheduleEditor.recurrenceDayOfMonth}
                  onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceDayOfMonth: e.target.value }))}
                  placeholder={t("dayOfMonth", "day-of-month")}
                  disabled={scheduleEditor.recurrenceType !== "monthly" || scheduleEditor.recurrenceMonthlyMode !== "day_of_month"}
                />
              </>
            ) : (
              <>
                <input disabled value={t("presetLabel", "Preset: {label}", { label: schedulePresetLabel(scheduleEditor.recurrencePreset, t) })} />
                <input disabled value={t("ruleInterval", "Rule interval: {value}", { value: scheduleEditor.recurrenceInterval || 1 })} />
                <input disabled value={scheduleEditor.recurrenceWeekdays.join(",") || scheduleEditor.recurrenceMonthlyMode || "-"} />
              </>
            )}
            <input
              type="datetime-local"
              value={scheduleEditor.recurrenceEndAt}
              onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceEndAt: e.target.value }))}
            />
          </div>
          <div className="schedule-actions">
            <button type="button" onClick={saveScheduleEditor}>{t("saveSchedule", "Save schedule")}</button>
            <button type="button" className="secondary-btn" onClick={() => setScheduleEditor(null)}>{t("cancel", "Cancel")}</button>
          </div>
        </section>
      ) : null}

      {viewMode === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event) => setActiveTaskId(String(event.active.id).replace("task:", ""))}
          onDragCancel={() => setActiveTaskId("")}
          onDragEnd={onDragEnd}
        >
          <section className="board">
            {STATUS.map((column) => (
              <KanbanColumn
                key={column.key}
                statusKey={column.key}
                title={statusLabel(column.key, t)}
                tasks={grouped[column.key]}
                onMove={onMove}
                onApprove={onApprove}
                onReject={onReject}
                onArchive={onArchive}
                onUpdateSchedule={onUpdateSchedule}
                canReview={canReview}
                memberNameById={memberNameById}
                t={t}
                locale={locale}
                openCommentTaskId={openCommentTaskId}
                commentsByTask={commentsByTask}
                attachmentsByTask={attachmentsByTask}
                commentDraftByTask={commentDraftByTask}
                attachmentDraftByTask={attachmentDraftByTask}
                setCommentDraftByTask={setCommentDraftByTask}
                setAttachmentDraftByTask={setAttachmentDraftByTask}
                toggleComments={toggleComments}
                submitComment={submitComment}
                submitAttachment={submitAttachment}
                removeAttachment={removeAttachment}
                onCopyTaskLink={copyTaskLink}
              />
            ))}
          </section>
          <DragOverlay>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                onMove={onMove}
                onApprove={onApprove}
                onReject={onReject}
                onArchive={onArchive}
                onUpdateSchedule={onUpdateSchedule}
                canReview={canReview}
                isOverlay
                memberNameById={memberNameById}
                isCommentsOpen={false}
                comments={[]}
                attachments={[]}
                draft={""}
                attachmentDraft={{ fileName: "", fileUrl: "", fileObject: null }}
                onDraftChange={() => {}}
                onAttachmentDraftChange={() => {}}
                onToggleComments={() => {}}
                onSubmitComment={() => {}}
                onSubmitAttachment={() => {}}
                onRemoveAttachment={() => {}}
                onCopyTaskLink={() => {}}
                t={t}
                locale={locale}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <section className="card calendar-panel">
          <div className="calendar-toolbar">
            <button type="button" onClick={() => setCalendarMonthOffset((x) => x - 1)}>{t("prev", "Prev")}</button>
            <strong>{monthRange.title}</strong>
            <button type="button" onClick={() => setCalendarMonthOffset((x) => x + 1)}>{t("next", "Next")}</button>
            <div className="view-switch calendar-switch">
              <button type="button" onClick={() => setCalendarLayout("grid")} className={calendarLayout === "grid" ? "active" : ""}>{t("month", "Month")}</button>
              <button type="button" onClick={() => setCalendarLayout("agenda")} className={calendarLayout === "agenda" ? "active" : ""}>{t("agenda", "Agenda")}</button>
            </div>
            <button type="button" onClick={onExportIcs}>{t("exportIcal", "Export iCal")}</button>
          </div>
          {calendarLayout === "grid" ? (
            <div className="calendar-month-grid">
              {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                <div key={d} className="calendar-weekday">{weekdayLabel(d, t)}</div>
              ))}
              {calendarGrid.map((cell, idx) => (
                <div key={cell ? cell.key : `empty-${idx}`} className={`calendar-cell ${cell ? "" : "calendar-cell-empty"}`}>
                  {cell ? (
                    <>
                      <div className="calendar-cell-day">{cell.day}</div>
                      <div className="calendar-cell-events">
                        {cell.events.slice(0, 3).map((ev) => (
                          <div className="calendar-chip" key={ev.id}>
                            {ev.title}
                          </div>
                        ))}
                        {cell.events.length > 3 ? <div className="calendar-chip-more">{t("moreCount", "+{count} more", { count: cell.events.length - 3 })}</div> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="calendar-agenda">
              {calendarGrouped.map((row) => (
                <div className="calendar-day" key={row.date}>
                  <h4>{row.date}</h4>
                  {row.items.map((ev) => (
                    <div className="calendar-event" key={ev.id}>
                      <strong>{ev.title}</strong>
                      <small>{new Date(ev.start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</small>
                      <small>{ev.recurrenceType}</small>
                    </div>
                  ))}
                </div>
              ))}
              {calendarGrouped.length === 0 ? <p>{t("noEventsMonth", "No scheduled events for this month.")}</p> : null}
            </div>
          )}
        </section>
      )}

      <section className="card activity">
        <h2>{t("activityTimeline", "Activity Timeline")}</h2>
        <p className="section-note">{t("activityNote", "Live stream of board changes and review decisions.")}</p>
        <div className="activity-list">
          {activity.map((row) => (
            <div className="activity-item" key={row.id}>
              <strong>{row.action}</strong>
              <span>{row.actor_name}</span>
              <small>{new Date(row.created_at).toLocaleString(locale)}</small>
            </div>
          ))}
        </div>
      </section>

      {info ? <p className="info">{info}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}

function KanbanColumn({
  statusKey,
  title,
  tasks,
  onMove,
  onApprove,
  onReject,
  onArchive,
  onUpdateSchedule,
  canReview,
  memberNameById,
  openCommentTaskId,
  commentsByTask,
  attachmentsByTask,
  commentDraftByTask,
  attachmentDraftByTask,
  setCommentDraftByTask,
  setAttachmentDraftByTask,
  toggleComments,
  submitComment,
  submitAttachment,
  removeAttachment,
  onCopyTaskLink,
  t = (key, fallback) => fallback || key,
  locale,
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `col:${statusKey}` });
  return (
    <article className={`column column-${statusKey} ${isOver ? "column-over" : ""}`} ref={setNodeRef}>
      <h3>{title} <span>{tasks.length}</span></h3>
      <div className="column-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onMove={onMove}
            onApprove={onApprove}
            onReject={onReject}
            onArchive={onArchive}
            onUpdateSchedule={onUpdateSchedule}
            canReview={canReview}
            memberNameById={memberNameById}
            t={t}
            locale={locale}
            isCommentsOpen={openCommentTaskId === task.id}
            comments={commentsByTask[task.id] || []}
            attachments={attachmentsByTask[task.id] || []}
            draft={commentDraftByTask[task.id] || ""}
            attachmentDraft={attachmentDraftByTask[task.id] || { fileName: "", fileUrl: "", fileObject: null }}
            onDraftChange={(value) => setCommentDraftByTask((curr) => ({ ...curr, [task.id]: value }))}
            onAttachmentDraftChange={(value) =>
              setAttachmentDraftByTask((curr) => ({ ...curr, [task.id]: { ...(curr[task.id] || {}), ...value } }))
            }
            onToggleComments={() => toggleComments(task.id)}
            onSubmitComment={() => submitComment(task.id)}
            onSubmitAttachment={() => submitAttachment(task.id)}
            onRemoveAttachment={(attachmentId) => removeAttachment(task.id, attachmentId)}
            onCopyTaskLink={() => onCopyTaskLink(task)}
          />
        ))}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  onMove,
  onApprove,
  onReject,
  onArchive,
  onUpdateSchedule,
  canReview,
  isOverlay = false,
  memberNameById = {},
  isCommentsOpen,
  comments,
  attachments,
  draft,
  attachmentDraft,
  onDraftChange,
  onAttachmentDraftChange,
  onToggleComments,
  onSubmitComment,
  onSubmitAttachment,
  onRemoveAttachment,
  onCopyTaskLink,
  t = (key, fallback) => fallback || key,
  locale,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task:${task.id}` });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`task ${isOverlay ? "task-overlay" : ""}`} {...attributes} {...listeners}>
      <strong>{task.title}</strong>
      <p>{task.description || t("noDescription", "No description")}</p>
      <small>{t("priority", "priority")}: {priorityLabel(task.priority, t)}</small>
      <small>{t("assignee", "assignee")}: {task.assigned_to ? memberNameById[task.assigned_to] || t("unknown", "Unknown") : t("unassigned", "Unassigned")}</small>
      <small>{t("reviewStatus", "review")}: {reviewStatusLabel(task.review_status || "pending", t)}</small>
      <small>{t("repeat", "repeat")}: {schedulePresetLabel(inferPreset(task), t)}</small>
      {task.due_date ? <small>{t("due", "due")}: {new Date(task.due_date).toLocaleString(locale)}</small> : null}
      {isOverdue(task) ? <small className="badge-danger">{t("overdueBadge", "overdue")}</small> : null}
      {isPendingReviewLate(task) ? <small className="badge-warn">{t("reviewLateBadge", "review SLA >24h")}</small> : null}
      {isSlaOverdue(task) ? <small className="badge-sla">{t("slaOverdueBadge", "sla overdue")}</small> : null}
      {isSlaEscalated(task) ? <small className="badge-escalated">{t("escalatedBadge", "escalated")}</small> : null}
      {task.review_comment ? <small>{t("reviewNote", "review note")}: {task.review_comment}</small> : null}

      <div className="task-actions">
        {STATUS.filter((x) => x.key !== task.status).map((target) => (
          <button
            key={target.key}
            type="button"
            className={`task-btn move-${target.key}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMove(task.id, target.key)}
          >
            {t("moveTo", "Move to {status}", { status: statusLabel(target.key, t) })}
          </button>
        ))}
        <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={() => onUpdateSchedule(task)}>
          {t("schedule", "Schedule")}
        </button>
        <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onCopyTaskLink}>
          {t("copyLink", "Copy link")}
        </button>
        {canReview && task.status === "done" && task.review_status !== "approved" ? (
          <>
            <button type="button" className="task-btn task-btn-ok" onPointerDown={(e) => e.stopPropagation()} onClick={() => onApprove(task.id)}>{t("approve", "Approve")}</button>
            <button type="button" className="task-btn task-btn-danger" onPointerDown={(e) => e.stopPropagation()} onClick={() => onReject(task.id)}>{t("reject", "Reject")}</button>
          </>
        ) : null}
        {canReview && task.status === "done" && task.review_status === "approved" && !task.archived_at ? (
          <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={() => onArchive(task.id, true)}>{t("archive", "Archive")}</button>
        ) : null}
        {canReview && task.archived_at ? (
          <button type="button" className="task-btn task-btn-ok" onPointerDown={(e) => e.stopPropagation()} onClick={() => onArchive(task.id, false)}>{t("unarchive", "Unarchive")}</button>
        ) : null}
      </div>

      {!isOverlay ? <button type="button" className="comment-fab" onPointerDown={(e) => e.stopPropagation()} onClick={onToggleComments}>{t("comment", "Comment")}</button> : null}

      {isCommentsOpen ? (
        <div className="comment-panel" onPointerDown={(e) => e.stopPropagation()}>
          <h4>{t("comments", "Comments")}</h4>
          <div className="comment-list">
            {comments.map((comment) => (
              <div className="comment-item" key={comment.id}>
                <strong>{comment.user_name}</strong>
                <p>{comment.content}</p>
                <small>{new Date(comment.created_at).toLocaleString(locale)}</small>
              </div>
            ))}
            {comments.length === 0 ? <p>{t("noComments", "No comments yet.")}</p> : null}
          </div>
          <textarea placeholder={task.status === "done" ? t("doneCommentHint", "Describe what was completed...") : t("addCommentHint", "Add comment...")} value={draft} onChange={(e) => onDraftChange(e.target.value)} />
          <button type="button" onClick={onSubmitComment}>{t("postComment", "Post comment")}</button>

          <h4>{t("attachments", "Attachments")}</h4>
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <div className="attachment-item" key={attachment.id}>
                <a href={attachment.file_url} target="_blank" rel="noreferrer">{attachment.file_name}</a>
                <button type="button" className="task-btn task-btn-muted" onClick={() => onRemoveAttachment(attachment.id)}>{t("remove", "Remove")}</button>
              </div>
            ))}
            {attachments.length === 0 ? <p>{t("noAttachments", "No attachments yet.")}</p> : null}
          </div>
          <div className="attachment-form">
            <input
              placeholder={t("fileNameOptional", "File name (optional)")}
              value={attachmentDraft.fileName || ""}
              onChange={(e) => onAttachmentDraftChange({ fileName: e.target.value })}
            />
            <input
              type="file"
              onChange={(e) => {
                const nextFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                onAttachmentDraftChange({ fileObject: nextFile });
              }}
            />
            <input
              placeholder={t("fileUrlOptional", "https://file-url (optional)")}
              value={attachmentDraft.fileUrl || ""}
              onChange={(e) => onAttachmentDraftChange({ fileUrl: e.target.value })}
            />
            <button type="button" onClick={onSubmitAttachment}>{t("attach", "Attach")}</button>
          </div>
          {attachmentDraft.fileObject ? <small>{t("selectedFile", "Selected file: {name}", { name: attachmentDraft.fileObject.name })}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
