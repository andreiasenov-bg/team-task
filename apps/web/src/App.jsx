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

function getNotificationMeta(type) {
  const meta = NOTIFICATION_TYPE_META[String(type || "")];
  if (meta) return meta;
  return { severity: "info", label: "General" };
}

function formatQueueDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
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

function queueErrorHint(errorMeta) {
  if (!errorMeta) return "";
  if (errorMeta.code === "190") {
    return "Meta token issue detected. Rotate WHATSAPP_ACCESS_TOKEN in .env.docker and restart the api service.";
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

function getMonthRange(offset = 0) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const from = new Date(base);
  const to = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59));
  return { from, to, title: base.toLocaleString(undefined, { month: "long", year: "numeric" }) };
}

export default function App() {
  const [token, setToken] = useLocalStorage("nexus_token", "");
  const [density, setDensity] = useLocalStorage("nexus_density", "comfortable");
  const [currentUser, setCurrentUser] = useState(null);
  const [healthState, setHealthState] = useState("checking");
  const [authForm, setAuthForm] = useState({ email: "admin@nexus-flow.local", password: "admin123" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

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

  const monthRange = useMemo(() => getMonthRange(calendarMonthOffset), [calendarMonthOffset]);

  const calendarGrouped = useMemo(() => {
    const map = new Map();
    for (const ev of calendarEvents) {
      const key = new Date(ev.start).toLocaleDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [calendarEvents]);

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
    const criticalUnread = notifications.filter((n) => !n.is_read && getNotificationMeta(n.type).severity === "critical").length;
    const reviewUnread = notifications.filter(
      (n) => !n.is_read && ["task.done.pending_review", "task.review.reminder"].includes(n.type)
    ).length;
    return { unread, criticalUnread, reviewUnread };
  }, [notifications]);

  const groupedVisibleNotifications = useMemo(() => {
    const groups = new Map();
    for (const n of visibleNotifications) {
      const meta = getNotificationMeta(n.type);
      const key = `${n.type || "general"}`;
      if (!groups.has(key)) groups.set(key, { key, type: n.type || "general", label: meta.label, severity: meta.severity, items: [] });
      groups.get(key).items.push(n);
    }
    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
  }, [visibleNotifications]);

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
      setInfo(notification.title || "New notification");
      pushToast(notification.title || "New notification", "info");
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
  }, [token, selectedProjectId, filters, monthRange.from.toISOString(), monthRange.to.toISOString()]);

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
    setInfo(`View applied: ${view.label}`);
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
    setInfo(`View saved: ${name}`);
  }

  function deleteActiveCustomView() {
    const selected = availableSavedViews.find((v) => v.id === activeSavedViewId);
    if (!selected || selected.readOnly) return;
    setCustomSavedViews((curr) => (curr || []).filter((v) => v.id !== selected.id));
    setActiveSavedViewId("");
    setInfo(`View removed: ${selected.label}`);
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
      const comment = window.prompt("Comment for rejection (optional)", "") || "";
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
      pushToast("Attachment added", "info");
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
      pushToast("Attachment removed", "info");
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
      setInfo("Notification preferences updated.");
      pushToast("Notification preferences saved", "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onReadAllNotifications() {
    try {
      await markAllNotificationsRead(token);
      setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true })));
      setNotifUnread(0);
      pushToast("All notifications marked as read", "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onClearReadNotifications() {
    try {
      await clearReadNotifications(token, 14);
      await refreshNotifications();
      pushToast("Old read notifications cleared", "info");
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
      pushToast("Task opened", "info");
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
      pushToast("Task link copied", "info");
    } catch {
      setError("Could not copy task link");
    }
  }

  async function approveTaskFromNotification(notification) {
    const taskId = notification && notification.task_id ? String(notification.task_id) : "";
    if (!taskId || !isPrivileged) return;
    try {
      await reviewTask(token, taskId, "approve", "");
      await onReadNotification(notification.id);
      await refreshTasks();
      pushToast("Task approved", "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function rejectTaskFromNotification(notification) {
    const taskId = notification && notification.task_id ? String(notification.task_id) : "";
    if (!taskId || !isPrivileged) return;
    const comment = window.prompt("Comment for rejection (optional)", "") || "";
    try {
      await reviewTask(token, taskId, "reject", comment);
      await onReadNotification(notification.id);
      await refreshTasks();
      pushToast("Task rejected", "info");
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
      pushToast("Opened review queue", "info");
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
      pushToast("Opened SLA escalations", "info");
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
      pushToast("Assistant skill created", "info");
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
      setInfo("SLA policy updated.");
      pushToast("SLA policy saved", "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRequeueWhatsapp(queueId) {
    try {
      await requeueWhatsappMessage(token, queueId);
      await refreshWhatsappOps();
      pushToast("WhatsApp message requeued", "info");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDecideSkillApproval(approvalId, status) {
    try {
      await decideAssistantSkillApproval(token, approvalId, status, "");
      await refreshAssistantAdminData();
      pushToast(`Skill request ${status}`, "info");
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
          <div className="auth-brand">
            <div className="logo-mark auth-logo-mark">
              <ListoMark />
            </div>
            <div>
              <h1 className="brand-wordmark">list<span>O</span></h1>
              <p>Sign in to open your board. API status: {healthState}</p>
            </div>
          </div>
          <div className="demo-login-row">
            {DEMO_USERS.map((user) => (
              <button key={user.key} type="button" className="ghost-btn" onClick={() => useDemoAccount(user.key)}>
                {user.label}
              </button>
            ))}
          </div>
          <form onSubmit={onLogin}>
            <label>Email</label>
            <input
              type="email"
              placeholder="name@company.com"
              value={authForm.email}
              onChange={(e) => setAuthForm((x) => ({ ...x, email: e.target.value }))}
              required
            />
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={authForm.password}
              onChange={(e) => setAuthForm((x) => ({ ...x, password: e.target.value }))}
              required
            />
            <button type="submit">Sign in</button>
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
            <small className="brand-subtitle">{isEmployee ? "My Tasks" : "Board Control"}</small>
            <div className="topbar-meta">
              <span className="topbar-chip">{currentUser ? currentUser.role : "..."}</span>
              <span className="topbar-chip">{projects.length} projects</span>
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
              <button type="button" onClick={() => setViewMode("board")} className={viewMode === "board" ? "active" : ""}>Board</button>
              <button type="button" onClick={() => setViewMode("calendar")} className={viewMode === "calendar" ? "active" : ""}>Calendar</button>
            </div>
          </div>
          <p>Signed in as {currentUser ? `${currentUser.name} (${currentUser.role})` : "loading..."}</p>
          <small className="shortcut-hint">Shortcuts: N new task, / search, B board, C calendar</small>
          <div className="topbar-row topbar-row-cta">
            <button type="button" className="ghost-btn" onClick={() => setDensity((x) => (x === "comfortable" ? "compact" : "comfortable"))}>
              Density: {density}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowNotifPanel((x) => !x)}>Notifications ({notifUnread})</button>
            <button type="button" className="danger-btn" onClick={() => setToken("")}>Logout</button>
          </div>
          {showNotifPanel ? (
            <div className="notif-panel card">
              <h3>Notifications</h3>
              <div className="notif-summary">
                <span className="notif-pill">{notificationSummary.unread} unread</span>
                <span className="notif-pill notif-pill-critical">{notificationSummary.criticalUnread} critical</span>
                <span className="notif-pill notif-pill-warn">{notificationSummary.reviewUnread} review</span>
              </div>
              {isPrivileged ? (
                <div className="notif-quick-actions">
                  <button type="button" className="secondary-btn" onClick={() => applyNotifFocus("review_queue")}>Open Review Queue</button>
                  <button type="button" className="ghost-btn" onClick={() => applyNotifFocus("sla_escalated")}>Open SLA Escalations</button>
                </div>
              ) : null}
              <div className="notif-tabs">
                <button type="button" className={notifTab === "unread" ? "active" : ""} onClick={() => setNotifTab("unread")}>Unread</button>
                <button type="button" className={notifTab === "all" ? "active" : ""} onClick={() => setNotifTab("all")}>All</button>
                <button type="button" className={notifTab === "critical" ? "active" : ""} onClick={() => setNotifTab("critical")}>Critical</button>
                <button type="button" className={notifTab === "mentions" ? "active" : ""} onClick={() => setNotifTab("mentions")}>Mentions</button>
              </div>
              <div className="notif-actions">
                <button type="button" className="secondary-btn" onClick={onReadAllNotifications}>Mark all read</button>
                <button type="button" className="ghost-btn" onClick={onClearReadNotifications}>Clear old read</button>
              </div>
              <div className="notif-prefs">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.in_app_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, in_app_enabled: e.target.checked }))}
                  />
                  In-app enabled
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.whatsapp_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, whatsapp_enabled: e.target.checked }))}
                  />
                  WhatsApp enabled
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.quiet_hours_enabled)}
                    onChange={(e) => setNotificationPrefs((curr) => ({ ...curr, quiet_hours_enabled: e.target.checked }))}
                  />
                  Quiet hours
                </label>
                <div className="notif-prefs-grid">
                  <div>
                    <small>Quiet from (hour)</small>
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
                    <small>Quiet to (hour)</small>
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
                <button type="button" className="secondary-btn" onClick={onSaveNotificationPreferences}>Save preferences</button>
              </div>
              {groupedVisibleNotifications.map((group) => (
                <section key={group.key} className="notif-group">
                  <h4 className={`notif-group-title notif-group-${group.severity}`}>
                    {group.label} ({group.items.length})
                  </h4>
                  {group.items.map((n) => (
                    <div key={n.id} className={`notif-item notif-item-${getNotificationMeta(n.type).severity} ${n.is_read ? "" : "notif-unread"}`}>
                      <strong>{n.title}</strong>
                      <p>{n.message}</p>
                      <small>{new Date(n.created_at).toLocaleString()}</small>
                      <div className="notif-item-actions">
                        {n.task_id ? (
                          <button type="button" className="ghost-btn" onClick={() => openTaskFromNotification(n)}>
                            Open task
                          </button>
                        ) : null}
                        {isPrivileged && n.task_id && ["task.done.pending_review", "task.review.reminder"].includes(n.type) ? (
                          <>
                            <button type="button" className="secondary-btn" onClick={() => approveTaskFromNotification(n)}>
                              Approve
                            </button>
                            <button type="button" className="danger-btn" onClick={() => rejectTaskFromNotification(n)}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        {!n.is_read ? <button type="button" onClick={() => onReadNotification(n.id)}>Mark read</button> : null}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
              {groupedVisibleNotifications.length === 0 ? <p className="section-note">No notifications in this tab.</p> : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="kpi-grid">
        {[
          { key: "active", label: "Active", value: kpis.active },
          { key: "overdue", label: "Overdue", value: kpis.overdue },
          { key: "pendingReviewLate", label: "Review SLA >24h", value: kpis.pendingReviewLate },
          { key: "slaOverdue", label: "SLA Overdue", value: kpis.slaOverdue },
          { key: "slaEscalated", label: "SLA Escalated", value: kpis.slaEscalated },
          { key: "archived", label: "Archived", value: kpis.archived },
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
            title={`Open ${item.label}`}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {isPrivileged ? (
        <section ref={adminInboxRef} className="card admin-inbox">
          <div className="admin-inbox-head">
            <h2>Admin Inbox</h2>
            <small>Fast action queue for review and escalations</small>
          </div>
          <div className="admin-inbox-grid">
            <article>
              <h3>Pending Review ({adminInbox.reviewQueue.length})</h3>
              {adminInbox.reviewQueue.slice(0, 5).map((task) => (
                <div key={task.id} className="admin-inbox-item">
                  <strong>{task.title}</strong>
                  <small>assignee: {task.assigned_to ? memberNameById[task.assigned_to] || "Unknown" : "Unassigned"}</small>
                  <div className="admin-inbox-actions">
                    <button type="button" className="ghost-btn" onClick={() => openTaskPanel(task.id, task.title, task.status)}>Open</button>
                    <button type="button" className="secondary-btn" onClick={() => onApprove(task.id)}>Approve</button>
                    <button type="button" className="danger-btn" onClick={() => onReject(task.id)}>Reject</button>
                  </div>
                </div>
              ))}
              {adminInbox.reviewQueue.length === 0 ? <p className="section-note">No pending review tasks.</p> : null}
            </article>
            <article>
              <h3>SLA Escalated ({adminInbox.slaEscalated.length})</h3>
              {adminInbox.slaEscalated.slice(0, 5).map((task) => (
                <div key={task.id} className="admin-inbox-item">
                  <strong>{task.title}</strong>
                  <small>status: {task.status}</small>
                  <div className="admin-inbox-actions">
                    <button type="button" className="ghost-btn" onClick={() => openTaskPanel(task.id, task.title, task.status)}>Open</button>
                    {task.status === "done" && task.review_status === "pending" ? (
                      <button type="button" className="secondary-btn" onClick={() => onApprove(task.id)}>Approve</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {adminInbox.slaEscalated.length === 0 ? <p className="section-note">No escalated SLA tasks.</p> : null}
            </article>
          </div>
        </section>
      ) : null}

      <section className="card saved-views">
        <h2>Saved Views</h2>
        <div className="saved-views-row">
          <select value={activeSavedViewId} onChange={(e) => applySavedView(e.target.value)}>
            <option value="">Select view</option>
            {availableSavedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.label}{view.readOnly ? " (default)" : ""}
              </option>
            ))}
          </select>
          <input
            placeholder="Save current as..."
            value={savedViewName}
            onChange={(e) => setSavedViewName(e.target.value)}
          />
          <button type="button" className="ghost-btn" onClick={saveCurrentView}>Save view</button>
          <button type="button" className="ghost-btn" onClick={deleteActiveCustomView}>Delete view</button>
        </div>
      </section>

      <section className="card quick-filters">
        <h2>Quick Filters</h2>
        <div className="quick-filters-row">
          {quickFilters.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`ghost-btn ${activeQuickFilter === preset.key ? "active-chip" : ""}`}
              onClick={() => applyQuickFilter(preset.key)}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" className={`ghost-btn ${activeQuickFilter === "custom" ? "active-chip" : ""}`} onClick={() => setActiveQuickFilter("custom")}>
            Custom
          </button>
        </div>
      </section>

      {isPrivileged ? (
        <section className="card sla-policy-admin">
          <h2>SLA Policy</h2>
          <p className="section-note">Live settings for reminder cadence. Changes apply without API restart.</p>
          <div className="sla-policy-grid">
            <label>
              <input
                type="checkbox"
                checked={Boolean(slaPolicy.enabled)}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, enabled: e.target.checked }))}
              />
              Enabled
            </label>
            <label>
              Default SLA (hours)
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.defaultHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, defaultHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              Repeat every (hours)
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.repeatHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, repeatHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              Max reminders per task
              <input
                type="number"
                min="1"
                max="50"
                value={slaPolicy.maxReminders}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, maxReminders: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              Escalation delay (hours)
              <input
                type="number"
                min="1"
                max="168"
                value={slaPolicy.escalationHours}
                onChange={(e) => setSlaPolicy((curr) => ({ ...curr, escalationHours: Number(e.target.value || 1) }))}
              />
            </label>
            <label>
              Scan interval (seconds)
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
          <button type="button" className="secondary-btn" onClick={onSaveSlaPolicy}>Save SLA policy</button>
        </section>
      ) : null}

      {isPrivileged ? (
        <section className="card assistant-admin">
          <h2>Assistant Skills Admin</h2>
          <p className="section-note">Create dynamic SQL skills and approve pending access requests.</p>
          <form className="assistant-skill-form" onSubmit={onCreateAssistantSkill}>
            <input
              placeholder="skill key (e.g. overdue-mine)"
              value={assistantSkillForm.skillKey}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, skillKey: e.target.value }))}
              required
            />
            <input
              placeholder="title"
              value={assistantSkillForm.title}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, title: e.target.value }))}
              required
            />
            <input
              placeholder="description"
              value={assistantSkillForm.description}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, description: e.target.value }))}
            />
            <textarea
              placeholder="Safe SELECT SQL"
              value={assistantSkillForm.querySql}
              onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, querySql: e.target.value }))}
              required
            />
            <div className="assistant-roles">
              <label><input type="checkbox" checked={assistantSkillForm.roles.employee} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, employee: e.target.checked } }))} /> employee</label>
              <label><input type="checkbox" checked={assistantSkillForm.roles.manager} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, manager: e.target.checked } }))} /> manager</label>
              <label><input type="checkbox" checked={assistantSkillForm.roles.admin} onChange={(e) => setAssistantSkillForm((curr) => ({ ...curr, roles: { ...curr.roles, admin: e.target.checked } }))} /> admin</label>
            </div>
            <button type="submit">Create skill</button>
          </form>
          <div className="assistant-grid">
            <article>
              <h3>Dynamic Skills</h3>
              {assistantSkills.map((skill) => (
                <div key={skill.id || skill.skill_key} className="assistant-item">
                  <strong>{skill.skill_key || skill.key}</strong>
                  <small>{skill.title}</small>
                </div>
              ))}
            </article>
            <article>
              <h3>Pending Approvals</h3>
              {assistantApprovals.length === 0 ? <p>No pending approvals.</p> : null}
              {assistantApprovals.map((approval) => (
                <div key={approval.id} className="assistant-item">
                  <strong>{approval.skill_key}</strong>
                  <small>{approval.user_email}</small>
                  <div className="assistant-item-actions">
                    <button type="button" className="secondary-btn" onClick={() => onDecideSkillApproval(approval.id, "approved")}>Approve</button>
                    <button type="button" className="danger-btn" onClick={() => onDecideSkillApproval(approval.id, "rejected")}>Reject</button>
                  </div>
                </div>
              ))}
            </article>
          </div>
        </section>
      ) : null}

      {isPrivileged ? (
        <section className="card assistant-admin">
          <h2>WhatsApp Delivery Queue</h2>
          <p className="section-note">Monitor outbound retries and manually requeue failed messages.</p>
          <div className="queue-toolbar">
            <select value={whatsappQueueFilter} onChange={(e) => setWhatsappQueueFilter(e.target.value)}>
              <option value="">all</option>
              <option value="failed">failed</option>
              <option value="pending">pending</option>
              <option value="sent">sent</option>
            </select>
            <button type="button" className="secondary-btn" onClick={() => refreshWhatsappOps().catch((e) => setError(e.message))}>
              Refresh
            </button>
          </div>
          <div className="queue-metrics">
            <article className="queue-metric-card">
              <small>Pending</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.pending_count : 0}</strong>
            </article>
            <article className="queue-metric-card">
              <small>Failed</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.failed_count : 0}</strong>
            </article>
            <article className="queue-metric-card">
              <small>Sent</small>
              <strong>{whatsappMetrics && whatsappMetrics.outboundQueue ? whatsappMetrics.outboundQueue.sent_count : 0}</strong>
            </article>
          </div>
          <div className="queue-list">
            {whatsappQueue.length === 0 ? <p className="queue-empty">No queue messages for this filter.</p> : null}
            {whatsappQueue.map((item) => {
              const errorMeta = parseQueueError(item.last_error);
              return (
                <div key={item.id} className={`queue-item queue-item-${String(item.status || "pending")}`}>
                  <div className="queue-item-topline">
                    <div className="queue-item-head">
                      <span className={`queue-status queue-status-${String(item.status || "pending")}`}>{item.status || "pending"}</span>
                      <strong className="queue-recipient">{item.recipient || "Unknown recipient"}</strong>
                    </div>
                    <small className="queue-created">Created {formatQueueDate(item.created_at)}</small>
                  </div>
                  <div className="queue-item-meta">
                    <div>
                      <small>Attempts</small>
                      <strong>{item.attempts}/{item.max_attempts}</strong>
                    </div>
                    <div>
                      <small>Next Retry</small>
                      <strong>{formatQueueDate(item.next_attempt_at)}</strong>
                    </div>
                    <div>
                      <small>Last Sent</small>
                      <strong>{item.sent_at ? formatQueueDate(item.sent_at) : "-"}</strong>
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
                      {queueErrorHint(errorMeta) ? <small className="queue-error-hint">{queueErrorHint(errorMeta)}</small> : null}
                    </div>
                  ) : null}
                  {item.status === "failed" ? (
                    <div className="queue-actions">
                      <button type="button" className="secondary-btn" onClick={() => onRequeueWhatsapp(item.id)}>Requeue now</button>
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
          placeholder="Search title/description"
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
          <option value="">All status</option>
          <option value="todo">todo</option><option value="in_progress">in_progress</option><option value="done">done</option>
        </select>
        <select value={reviewFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setReviewFilter(e.target.value);
        }}>
          <option value="">All review</option>
          <option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option>
        </select>
        {isEmployee ? (
          <input value="Assignee: me" disabled />
        ) : (
          <select value={assigneeFilter} onChange={(e) => {
            setActiveQuickFilter("custom");
            setAssigneeFilter(e.target.value);
          }}>
            <option value="">All assignees</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        )}
        <select value={dueFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setDueFilter(e.target.value);
        }}>
          <option value="">All due states</option>
          <option value="overdue">overdue</option>
          <option value="review_late">review overdue 24h</option>
          <option value="today">due today</option>
          <option value="week">due in 7d</option>
          <option value="none">no due date</option>
        </select>
        <select value={slaFilter} onChange={(e) => {
          setActiveQuickFilter("custom");
          setSlaFilter(e.target.value);
        }}>
          <option value="">All SLA states</option>
          <option value="sla_overdue">sla overdue</option>
          <option value="sla_escalated">sla escalated</option>
        </select>
        <label className="archive-toggle">
          <input type="checkbox" checked={includeArchived} onChange={(e) => {
            setActiveQuickFilter("custom");
            setIncludeArchived(e.target.checked);
          }} /> Show archived
        </label>
      </section>

      <section className="card composer">
        <h2>Quick add task</h2>
        <p className="section-note">{isEmployee ? "Create and track only your own tasks." : "Set assignee, due date and schedule in one flow."}</p>
        <form onSubmit={onCreateTask} className="grid-form">
          <input
            ref={taskTitleInputRef}
            placeholder="Task title"
            value={taskForm.title}
            onChange={(e) => setTaskForm((x) => ({ ...x, title: e.target.value }))}
            required
          />
          <input placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm((x) => ({ ...x, description: e.target.value }))} />
          <select value={taskForm.priority} onChange={(e) => setTaskForm((x) => ({ ...x, priority: e.target.value }))}>
            <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
          </select>
          <select value={taskForm.status} onChange={(e) => setTaskForm((x) => ({ ...x, status: e.target.value }))}>
            <option value="todo">todo</option><option value="in_progress">in_progress</option><option value="done">done</option>
          </select>
          {isEmployee ? (
            <input value={`Assigned to: ${currentUser ? currentUser.name : "me"}`} disabled />
          ) : (
            <select value={taskForm.assignedTo} onChange={(e) => setTaskForm((x) => ({ ...x, assignedTo: e.target.value }))}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
              ))}
            </select>
          )}
          <button type="submit">Create</button>

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
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
          {taskForm.recurrencePreset === "custom" ? (
            <>
              <select value={taskForm.recurrenceType} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceType: e.target.value }))}>
                <option value="none">one-time</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
              <input
                type="number"
                min="1"
                max="365"
                value={taskForm.recurrenceInterval}
                onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceInterval: e.target.value }))}
                placeholder="interval"
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
                    <option key={wd} value={wd}>{wd}</option>
                  ))}
                </select>
              ) : taskForm.recurrenceType === "monthly" ? (
                <select
                  value={taskForm.recurrenceMonthlyMode}
                  onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceMonthlyMode: e.target.value }))}
                >
                  <option value="day_of_month">day of month</option>
                  <option value="last_business_day">last business day</option>
                </select>
              ) : (
                <input disabled value="-" />
              )}
              {taskForm.recurrenceType === "monthly" && taskForm.recurrenceMonthlyMode === "day_of_month" ? (
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="day-of-month"
                  value={taskForm.recurrenceDayOfMonth}
                  onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceDayOfMonth: e.target.value }))}
                />
              ) : (
                <input type="datetime-local" value={taskForm.recurrenceEndAt} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceEndAt: e.target.value }))} />
              )}
            </>
          ) : (
            <>
              <input disabled value={`Preset: ${SCHEDULE_PRESETS.find((p) => p.key === taskForm.recurrencePreset)?.label || "One-time"}`} />
              <input type="datetime-local" value={taskForm.recurrenceEndAt} onChange={(e) => setTaskForm((x) => ({ ...x, recurrenceEndAt: e.target.value }))} />
              <input disabled value={`Rule interval: ${taskForm.recurrenceInterval}`} />
              <input disabled value={taskForm.recurrenceWeekdays.join(",") || taskForm.recurrenceMonthlyMode || "-"} />
            </>
          )}
        </form>
      </section>

      {scheduleEditor ? (
        <section className="card schedule-editor">
          <h3>Schedule task: {scheduleEditor.title}</h3>
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
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
            {scheduleEditor.recurrencePreset === "custom" ? (
              <>
                <select
                  value={scheduleEditor.recurrenceType}
                  onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceType: e.target.value }))}
                >
                  <option value="none">one-time</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
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
                      <option key={wd} value={wd}>{wd}</option>
                    ))}
                  </select>
                ) : scheduleEditor.recurrenceType === "monthly" ? (
                  <select
                    value={scheduleEditor.recurrenceMonthlyMode}
                    onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceMonthlyMode: e.target.value }))}
                  >
                    <option value="day_of_month">day of month</option>
                    <option value="last_business_day">last business day</option>
                  </select>
                ) : (
                  <input disabled value="no extra rule" />
                )}
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={scheduleEditor.recurrenceDayOfMonth}
                  onChange={(e) => setScheduleEditor((x) => ({ ...x, recurrenceDayOfMonth: e.target.value }))}
                  placeholder="day-of-month"
                  disabled={scheduleEditor.recurrenceType !== "monthly" || scheduleEditor.recurrenceMonthlyMode !== "day_of_month"}
                />
              </>
            ) : (
              <>
                <input disabled value={`Preset: ${SCHEDULE_PRESETS.find((p) => p.key === scheduleEditor.recurrencePreset)?.label || "one-time"}`} />
                <input disabled value={`Interval: ${scheduleEditor.recurrenceInterval || 1}`} />
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
            <button type="button" onClick={saveScheduleEditor}>Save schedule</button>
            <button type="button" className="secondary-btn" onClick={() => setScheduleEditor(null)}>Cancel</button>
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
                title={column.label}
                tasks={grouped[column.key]}
                onMove={onMove}
                onApprove={onApprove}
                onReject={onReject}
                onArchive={onArchive}
                onUpdateSchedule={onUpdateSchedule}
                canReview={canReview}
                memberNameById={memberNameById}
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
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <section className="card calendar-panel">
          <div className="calendar-toolbar">
            <button type="button" onClick={() => setCalendarMonthOffset((x) => x - 1)}>Prev</button>
            <strong>{monthRange.title}</strong>
            <button type="button" onClick={() => setCalendarMonthOffset((x) => x + 1)}>Next</button>
            <div className="view-switch calendar-switch">
              <button type="button" onClick={() => setCalendarLayout("grid")} className={calendarLayout === "grid" ? "active" : ""}>Month</button>
              <button type="button" onClick={() => setCalendarLayout("agenda")} className={calendarLayout === "agenda" ? "active" : ""}>Agenda</button>
            </div>
            <button type="button" onClick={onExportIcs}>Export iCal</button>
          </div>
          {calendarLayout === "grid" ? (
            <div className="calendar-month-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="calendar-weekday">{d}</div>
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
                        {cell.events.length > 3 ? <div className="calendar-chip-more">+{cell.events.length - 3} more</div> : null}
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
                      <small>{new Date(ev.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      <small>{ev.recurrenceType}</small>
                    </div>
                  ))}
                </div>
              ))}
              {calendarGrouped.length === 0 ? <p>No scheduled events for this month.</p> : null}
            </div>
          )}
        </section>
      )}

      <section className="card activity">
        <h2>Activity Timeline</h2>
        <p className="section-note">Live stream of board changes and review decisions.</p>
        <div className="activity-list">
          {activity.map((row) => (
            <div className="activity-item" key={row.id}>
              <strong>{row.action}</strong>
              <span>{row.actor_name}</span>
              <small>{new Date(row.created_at).toLocaleString()}</small>
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
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task:${task.id}` });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`task ${isOverlay ? "task-overlay" : ""}`} {...attributes} {...listeners}>
      <strong>{task.title}</strong>
      <p>{task.description || "No description"}</p>
      <small>priority: {task.priority}</small>
      <small>assignee: {task.assigned_to ? memberNameById[task.assigned_to] || "Unknown" : "Unassigned"}</small>
      <small>review: {task.review_status || "pending"}</small>
      <small>repeat: {inferPreset(task).replaceAll("_", " ")}</small>
      {task.due_date ? <small>due: {new Date(task.due_date).toLocaleString()}</small> : null}
      {isOverdue(task) ? <small className="badge-danger">overdue</small> : null}
      {isPendingReviewLate(task) ? <small className="badge-warn">review SLA &gt;24h</small> : null}
      {isSlaOverdue(task) ? <small className="badge-sla">sla overdue</small> : null}
      {isSlaEscalated(task) ? <small className="badge-escalated">escalated</small> : null}
      {task.review_comment ? <small>review note: {task.review_comment}</small> : null}

      <div className="task-actions">
        {STATUS.filter((x) => x.key !== task.status).map((target) => (
          <button
            key={target.key}
            type="button"
            className={`task-btn move-${target.key}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMove(task.id, target.key)}
          >
            Move to {target.label}
          </button>
        ))}
        <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={() => onUpdateSchedule(task)}>
          Schedule
        </button>
        <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onCopyTaskLink}>
          Copy link
        </button>
        {canReview && task.status === "done" && task.review_status !== "approved" ? (
          <>
            <button type="button" className="task-btn task-btn-ok" onPointerDown={(e) => e.stopPropagation()} onClick={() => onApprove(task.id)}>Approve</button>
            <button type="button" className="task-btn task-btn-danger" onPointerDown={(e) => e.stopPropagation()} onClick={() => onReject(task.id)}>Reject</button>
          </>
        ) : null}
        {canReview && task.status === "done" && task.review_status === "approved" && !task.archived_at ? (
          <button type="button" className="task-btn task-btn-muted" onPointerDown={(e) => e.stopPropagation()} onClick={() => onArchive(task.id, true)}>Archive</button>
        ) : null}
        {canReview && task.archived_at ? (
          <button type="button" className="task-btn task-btn-ok" onPointerDown={(e) => e.stopPropagation()} onClick={() => onArchive(task.id, false)}>Unarchive</button>
        ) : null}
      </div>

      {!isOverlay ? <button type="button" className="comment-fab" onPointerDown={(e) => e.stopPropagation()} onClick={onToggleComments}>Comment</button> : null}

      {isCommentsOpen ? (
        <div className="comment-panel" onPointerDown={(e) => e.stopPropagation()}>
          <h4>Comments</h4>
          <div className="comment-list">
            {comments.map((comment) => (
              <div className="comment-item" key={comment.id}>
                <strong>{comment.user_name}</strong>
                <p>{comment.content}</p>
                <small>{new Date(comment.created_at).toLocaleString()}</small>
              </div>
            ))}
            {comments.length === 0 ? <p>No comments yet.</p> : null}
          </div>
          <textarea placeholder={task.status === "done" ? "Опиши какво е свършено..." : "Добави коментар..."} value={draft} onChange={(e) => onDraftChange(e.target.value)} />
          <button type="button" onClick={onSubmitComment}>Post comment</button>

          <h4>Attachments</h4>
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <div className="attachment-item" key={attachment.id}>
                <a href={attachment.file_url} target="_blank" rel="noreferrer">{attachment.file_name}</a>
                <button type="button" className="task-btn task-btn-muted" onClick={() => onRemoveAttachment(attachment.id)}>Remove</button>
              </div>
            ))}
            {attachments.length === 0 ? <p>No attachments yet.</p> : null}
          </div>
          <div className="attachment-form">
            <input
              placeholder="File name (optional)"
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
              placeholder="https://file-url (optional)"
              value={attachmentDraft.fileUrl || ""}
              onChange={(e) => onAttachmentDraftChange({ fileUrl: e.target.value })}
            />
            <button type="button" onClick={onSubmitAttachment}>Attach</button>
          </div>
          {attachmentDraft.fileObject ? <small>Selected file: {attachmentDraft.fileObject.name}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
