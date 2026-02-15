const ROLE_LABELS = {
  manager: "Мениджър",
  employee: "Служител",
};

const STATUS = [
  { key: "todo", label: "To Do", tagClass: "todo" },
  { key: "inprogress", label: "In Progress", tagClass: "inprogress" },
  { key: "done", label: "Done", tagClass: "done" },
];

// Used by index.html to detect whether app.js executed.
window.__TASK_APP_READY__ = true;

const els = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),

  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  authError: document.getElementById("authError"),

  // Shell
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  pageActions: document.getElementById("pageActions"),
  healthBadge: document.getElementById("healthBadge"),
  navItems: Array.from(document.querySelectorAll(".nav-item[data-route]")),

  // Current user
  currentUserInfo: document.getElementById("currentUserInfo"),
  currentRoleBadge: document.getElementById("currentRoleBadge"),
  logoutBtn: document.getElementById("logoutBtn"),

  // Views
  viewBoard: document.getElementById("view-board"),
  viewPeople: document.getElementById("view-people"),
  viewActivity: document.getElementById("view-activity"),
  viewNotifications: document.getElementById("view-notifications"),

  // Board
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskDescription: document.getElementById("taskDescription"),
  taskAssignee: document.getElementById("taskAssignee"),
  taskDueDate: document.getElementById("taskDueDate"),
  taskGroup: document.getElementById("taskGroup"),
  taskLabels: document.getElementById("taskLabels"),
  assigneeFilter: document.getElementById("assigneeFilter"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  dueFilter: document.getElementById("dueFilter"),
  groupFilter: document.getElementById("groupFilter"),
  labelFilter: document.getElementById("labelFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  toggleViewBtn: document.getElementById("toggleViewBtn"),
  accessHint: document.getElementById("accessHint"),
  resultsMeta: document.getElementById("resultsMeta"),
  board: document.getElementById("board"),
  boardWrap: document.getElementById("boardWrap"),
  tableWrap: document.getElementById("tableWrap"),
  tasksTable: document.getElementById("tasksTable"),
  detailPanel: document.getElementById("detailPanel"),

  // People
  peopleCreate: document.getElementById("peopleCreate"),
  newUserUsername: document.getElementById("newUserUsername"),
  newUserInput: document.getElementById("newUserInput"),
  newUserPhone: document.getElementById("newUserPhone"),
  newUserPassword: document.getElementById("newUserPassword"),
  newUserRole: document.getElementById("newUserRole"),
  addUserBtn: document.getElementById("addUserBtn"),
  userAdminPanel: document.getElementById("userAdminPanel"),
  userAdminList: document.getElementById("userAdminList"),

  // Notifications
  notifBadge: document.getElementById("notifBadge"),
  notifList: document.getElementById("notifList"),
  readAllBtn: document.getElementById("readAllBtn"),
  enableWebNotifBtn: document.getElementById("enableWebNotifBtn"),

  // Activity (audit)
  auditActorFilter: document.getElementById("auditActorFilter"),
  auditEntityFilter: document.getElementById("auditEntityFilter"),
  auditRefreshBtn: document.getElementById("auditRefreshBtn"),
  auditList: document.getElementById("auditList"),
};

const state = {
  me: null,
  route: "board",
  boardView: "kanban", // kanban | table
  users: [],
  tasks: [],
  selectedTaskId: null,
  filter: "all",
  search: "",
  status: "",
  due: "",
  label: "",
  group: "",
  notifications: [],
  unread: 0,
  audit: [],
  auditFilters: {
    actorUserId: "",
    entityType: "",
  },
  health: null,
};

let notifTimer = null;
let seenNotifIds = new Set();

init();

async function init() {
  installGlobalErrorHandlers();
  bindEvents();
  await restoreSession();
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    const msg = event && event.message ? event.message : "Unknown error";
    showAuthError(`JS error: ${msg}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason ? event.reason : null;
    const msg = reason && reason.message ? reason.message : String(reason || "Unknown promise rejection");
    showAuthError(`Promise error: ${msg}`);
  });
}

function showAuthError(message) {
  if (els.authError) {
    els.authError.textContent = message;
  } else {
    alert(message);
  }
}

function bindEvents() {
  els.loginForm.addEventListener("submit", onLogin);
  els.logoutBtn.addEventListener("click", onLogout);

  window.addEventListener("hashchange", () => {
    applyRouteFromHash();
    renderShell();
  });

  for (const btn of els.navItems) {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      setRoute(route);
    });
  }

  // Board
  els.taskForm.addEventListener("submit", onCreateTask);
  els.assigneeFilter.addEventListener("change", async () => {
    state.filter = els.assigneeFilter.value;
    await loadTasks();
    renderShell();
  });
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    renderShell();
  });
  els.statusFilter.addEventListener("change", () => {
    state.status = els.statusFilter.value;
    renderShell();
  });
  els.dueFilter.addEventListener("change", () => {
    state.due = els.dueFilter.value;
    renderShell();
  });
  els.groupFilter.addEventListener("change", () => {
    state.group = els.groupFilter.value;
    renderShell();
  });
  els.labelFilter.addEventListener("change", () => {
    state.label = els.labelFilter.value;
    renderShell();
  });
  els.clearFiltersBtn.addEventListener("click", () => {
    state.search = "";
    state.status = "";
    state.due = "";
    state.group = "";
    state.label = "";
    if (isManager()) state.filter = "all";
    renderShell();
  });
  els.toggleViewBtn.addEventListener("click", () => {
    state.boardView = state.boardView === "kanban" ? "table" : "kanban";
    renderShell();
  });

  // People
  els.addUserBtn.addEventListener("click", onAddUser);
  els.userAdminList.addEventListener("click", onUserAdminClick);

  // Notifications
  els.notifList.addEventListener("click", onNotifClick);
  els.readAllBtn.addEventListener("click", onReadAllNotifs);
  els.enableWebNotifBtn.addEventListener("click", enableWebNotifications);

  // Activity
  els.auditRefreshBtn.addEventListener("click", loadAudit);
  els.auditActorFilter.addEventListener("change", () => {
    state.auditFilters.actorUserId = els.auditActorFilter.value;
    loadAudit();
  });
  els.auditEntityFilter.addEventListener("change", () => {
    state.auditFilters.entityType = els.auditEntityFilter.value;
    loadAudit();
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function isManager() {
  return state.me && state.me.role === "manager";
}

function setRoute(route) {
  const allowed = new Set(["board", "people", "activity", "notifications"]);
  const next = allowed.has(route) ? route : "board";
  history.replaceState(null, "", `#app/${next}`);
  applyRouteFromHash();
  renderShell();
  scrollToTop();
}

function applyRouteFromHash() {
  const hash = String(location.hash || "");
  const m = hash.match(/^#app\/([^/]+)$/);
  const route = m ? m[1] : "board";
  state.route = route;
}

function showAuth() {
  state.me = null;
  els.authView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  history.replaceState(null, "", "#login");
  stopNotifPolling();
}

function showApp() {
  els.authView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  if (!location.hash.startsWith("#app/")) {
    history.replaceState(null, "", "#app/board");
  }
  applyRouteFromHash();
  scrollToTop();
}

function scrollToTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  } catch {
    window.scrollTo(0, 0);
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    if (!result.user) {
      showAuth();
      return;
    }
    state.me = result.user;
    await bootstrapApp();
  } catch {
    showAuth();
  }
}

async function bootstrapApp() {
  showApp();
  await loadHealth();
  await loadUsers();
  await loadTasks();
  await loadNotifications();
  startNotifPolling();
  if (isManager()) {
    await loadAudit();
  }
  renderShell();
}

async function loadHealth() {
  try {
    const h = await api("/api/health");
    state.health = h;
  } catch {
    state.health = null;
  }
}

async function onLogin(event) {
  event.preventDefault();
  showAuthError("");
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value.trim(),
        password: els.loginPassword.value,
      }),
    });
    state.me = result.user;

    const meCheck = await api("/api/auth/me");
    if (!meCheck.user) {
      showAuthError("Login OK, но сесията не се запазва (cookies са блокирани).");
      state.me = null;
      return;
    }

    els.loginForm.reset();
    await bootstrapApp();
  } catch (e) {
    showAuthError(e.message);
  }
}

async function onLogout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    state.users = [];
    state.tasks = [];
    state.selectedTaskId = null;
    state.notifications = [];
    state.unread = 0;
    state.audit = [];
    stopNotifPolling();
    seenNotifIds = new Set();
    showAuth();
  }
}

async function loadUsers() {
  const result = await api("/api/users");
  state.users = result.users;
}

async function loadTasks() {
  const query =
    isManager() && state.filter !== "all"
      ? `?assigneeId=${encodeURIComponent(state.filter)}`
      : "";
  const result = await api(`/api/tasks${query}`);
  state.tasks = result.tasks;
  if (!state.tasks.some((t) => t.id === state.selectedTaskId)) {
    state.selectedTaskId = null;
  }
}

async function loadNotifications() {
  try {
    const result = await api("/api/notifications");
    state.notifications = result.notifications || [];
    state.unread = result.unread || 0;
    if (!seenNotifIds.size) {
      for (const n of state.notifications) seenNotifIds.add(n.id);
    }
    maybeShowWebNotifications();
  } catch {
    // ignore
  }
}

function startNotifPolling() {
  stopNotifPolling();
  notifTimer = setInterval(async () => {
    await loadNotifications();
    renderNotifBadge();
    if (state.route === "notifications") renderNotifications();
  }, 15000);
}

function stopNotifPolling() {
  if (notifTimer) clearInterval(notifTimer);
  notifTimer = null;
}

async function loadAudit() {
  if (!isManager()) {
    state.audit = [];
    renderAudit();
    return;
  }
  const params = new URLSearchParams();
  params.set("limit", "200");
  if (state.auditFilters.actorUserId) params.set("actorUserId", state.auditFilters.actorUserId);
  if (state.auditFilters.entityType) params.set("entityType", state.auditFilters.entityType);
  const result = await api(`/api/audit?${params.toString()}`);
  state.audit = result.audit || [];
  renderAudit();
}

function renderShell() {
  if (!state.me) return;

  // Nav active state + role-based availability
  for (const btn of els.navItems) {
    const route = btn.dataset.route;
    const active = route === state.route;
    btn.setAttribute("aria-current", active ? "page" : "false");
    if (!isManager() && (route === "activity" || route === "people")) {
      btn.disabled = true;
      btn.title = "Нямаш достъп";
    } else {
      btn.disabled = false;
      btn.title = "";
    }
  }

  // Views visibility
  els.viewBoard.classList.toggle("hidden", state.route !== "board");
  els.viewPeople.classList.toggle("hidden", state.route !== "people");
  els.viewActivity.classList.toggle("hidden", state.route !== "activity");
  els.viewNotifications.classList.toggle("hidden", state.route !== "notifications");

  // Header
  els.currentUserInfo.value = `${state.me.displayName} (@${state.me.username})`;
  els.currentRoleBadge.textContent = `Роля: ${ROLE_LABELS[state.me.role]}`;

  // Page copy
  const page = {
    title: "Board",
    subtitle: "",
  };
  if (state.route === "board") {
    page.title = "Board";
    page.subtitle = isManager()
      ? "Твоят екип и задачите на всички."
      : "Само твоите задачи.";
  } else if (state.route === "people") {
    page.title = "People";
    page.subtitle = isManager()
      ? "Управление на потребители и роли."
      : "Нямаш достъп.";
  } else if (state.route === "activity") {
    page.title = "Activity";
    page.subtitle = isManager()
      ? "Глобална история на промени (audit)."
      : "Нямаш достъп.";
  } else if (state.route === "notifications") {
    page.title = "Notifications";
    page.subtitle = "Нотификации за приключени задачи и други събития.";
  }
  els.pageTitle.textContent = page.title;
  els.pageSubtitle.textContent = page.subtitle;
  renderHealthBadge();

  // Route-specific rendering
  renderBoardRoute();
  renderPeopleRoute();
  renderActivityRoute();
  renderNotificationsRoute();
}

function renderHealthBadge() {
  if (!els.healthBadge) return;
  if (!state.health) {
    els.healthBadge.textContent = "API: unknown";
    return;
  }
  els.healthBadge.textContent = `API v${state.health.version} | data: ${state.health.counts.tasks} tasks`;
}

function renderBoardRoute() {
  if (state.route !== "board") return;
  renderFilters();
  renderBoardView();
  renderDetails();
}

function renderBoardView() {
  const showTable = state.boardView === "table";
  els.boardWrap.classList.toggle("hidden", showTable);
  els.tableWrap.classList.toggle("hidden", !showTable);
  els.toggleViewBtn.textContent = showTable ? "Kanban" : "Table";
  if (showTable) renderTable();
  else renderBoard();
}

function renderPeopleRoute() {
  if (state.route !== "people") return;
  const manager = isManager();
  els.peopleCreate.classList.toggle("hidden", !manager);
  els.userAdminPanel.classList.toggle("hidden", !manager);
  els.addUserBtn.disabled = !manager;
  els.newUserUsername.disabled = !manager;
  els.newUserInput.disabled = !manager;
  els.newUserPhone.disabled = !manager;
  els.newUserPassword.disabled = !manager;
  els.newUserRole.disabled = !manager;
  if (manager) renderUserAdmin();
}

function renderActivityRoute() {
  if (state.route !== "activity") return;
  if (!isManager()) {
    els.auditList.innerHTML = `<p class="muted">Нямаш достъп до Activity.</p>`;
    return;
  }
  if (state._auditDirty) {
    state._auditDirty = false;
    loadAudit();
  }
  renderAuditFilters();
  renderAudit();
}

function renderNotificationsRoute() {
  renderNotifBadge();
  if (state.route !== "notifications") return;
  renderNotifications();
}

function renderFilters() {
  const manager = isManager();
  if (!manager) state.filter = "all";

  // Keep filter controls in sync with state.
  els.searchInput.value = state.search;
  els.statusFilter.value = state.status;
  els.dueFilter.value = state.due;

  const filterOptions = [
    `<option value="all">Всички</option>`,
    ...state.users.map(
      (u) =>
        `<option value="${escapeHtml(u.id)}">${escapeHtml(
          u.active === false ? `${u.displayName} (inactive)` : u.displayName
        )}</option>`
    ),
  ].join("");
  els.assigneeFilter.innerHTML = filterOptions;
  els.assigneeFilter.value = manager ? state.filter : "all";
  els.assigneeFilter.disabled = !manager;

  const activeUsers = state.users.filter((u) => u.active !== false && u.deleted !== true);
  const assigneeUsers = manager ? activeUsers : activeUsers.filter((u) => u.id === state.me.id);
  els.taskAssignee.innerHTML = assigneeUsers
    .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)}</option>`)
    .join("");
  els.taskAssignee.disabled = !manager;

  els.accessHint.textContent = manager
    ? "Мениджърски изглед: виждаш всички задачи."
    : "Служителски изглед: виждаш само твоите задачи.";

  // Group filter options from current tasks.
  const allGroups = new Set();
  for (const t of state.tasks) allGroups.add(t.group || "General");
  const groupOptions = [`<option value=\"\">Всички групи</option>`]
    .concat(
      Array.from(allGroups)
        .sort()
        .map((g) => `<option value=\"${escapeHtml(g)}\">${escapeHtml(g)}</option>`)
    )
    .join("");
  els.groupFilter.innerHTML = groupOptions;
  if (state.group && !allGroups.has(state.group)) state.group = "";
  els.groupFilter.value = state.group || "";

  // Populate label filter from available tasks.
  const allLabels = new Set();
  for (const t of state.tasks) {
    for (const l of t.labels || []) allLabels.add(l);
  }
  const labelOptions = [`<option value=\"\">Всички етикети</option>`]
    .concat(
      Array.from(allLabels)
        .sort()
        .map((l) => `<option value=\"${escapeHtml(l)}\">${escapeHtml(l)}</option>`)
    )
    .join("");
  els.labelFilter.innerHTML = labelOptions;
  if (state.label && !allLabels.has(state.label)) state.label = "";
  els.labelFilter.value = state.label || "";
}

async function onCreateTask(event) {
  event.preventDefault();
  const title = els.taskTitle.value.trim();
  if (!title) return;
  const assigneeId = isManager() ? els.taskAssignee.value || state.me.id : state.me.id;
  const group = els.taskGroup.value.trim();
  const labels = els.taskLabels.value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  try {
    const result = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title,
        description: els.taskDescription.value.trim(),
        dueDate: els.taskDueDate.value || "",
        assigneeId,
        group,
        labels,
      }),
    });
    els.taskForm.reset();
    state.selectedTaskId = result.task.id;
    await loadTasks();
    renderShell();
  } catch (e) {
    alert(e.message);
  }
}

function filteredTasks() {
  const q = state.search.trim().toLowerCase();
  const status = state.status;
  const due = state.due;
  const label = state.label;
  const group = state.group;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const next7 = startOfToday + 7 * 24 * 60 * 60 * 1000;

  return state.tasks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.description} ${t.assigneeName} ${(t.labels || []).join(" ")} ${
        t.group || ""
      }`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (status && t.status !== status) return false;
    if (group && (t.group || "General") !== group) return false;
    if (label) {
      const labels = t.labels || [];
      if (!labels.includes(label)) return false;
    }
    if (due) {
      const dueTs = t.dueDate ? Date.parse(t.dueDate) : NaN;
      if (due === "nodue") {
        if (t.dueDate) return false;
      } else if (due === "overdue") {
        if (!t.dueDate) return false;
        if (!(dueTs < startOfToday)) return false;
      } else if (due === "next7") {
        if (!t.dueDate) return false;
        if (!(dueTs >= startOfToday && dueTs <= next7)) return false;
      }
    }
    return true;
  });
}

function renderBoard() {
  const tasksForBoard = filteredTasks();
  renderResultsMeta(tasksForBoard.length, state.tasks.length);
  els.board.innerHTML = STATUS.map((s) => {
    const tasks = tasksForBoard.filter((t) => t.status === s.key);
    const cards = tasks
      .map(
        (t) => `
      <article class="card" data-id="${t.id}">
        <h4>${escapeHtml(t.title)}</h4>
        <p><strong>Отговорник:</strong> ${escapeHtml(t.assigneeName || "-")}</p>
        <p><strong>Краен срок:</strong> ${escapeHtml(t.dueDate || "-")}</p>
        <p><strong>Група:</strong> ${escapeHtml(t.group || "General")}</p>
        <p>${(t.labels || [])
          .slice(0, 4)
          .map((l) => `<span class="chip">${escapeHtml(l)}</span>`)
          .join("")}</p>
        <p><strong>Видяно от:</strong> ${t.seenBy.length} души</p>
      </article>
    `
      )
      .join("");
    return `
      <section class="column">
        <h3>${s.label}<span class="tag ${s.tagClass}">${tasks.length}</span></h3>
        ${cards || `<p class="muted">Няма задачи</p>`}
      </section>
    `;
  }).join("");

  els.board.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", async () => {
      state.selectedTaskId = card.dataset.id;
      try {
        await api(`/api/tasks/${card.dataset.id}/seen`, { method: "POST", body: "{}" });
      } catch {}
      await loadTasks();
      renderDetails();
    });
  });
}

function renderTable() {
  const rows = filteredTasks().slice().sort((a, b) => {
    const ga = (a.group || "General").localeCompare(b.group || "General");
    if (ga !== 0) return ga;
    const sa = a.status.localeCompare(b.status);
    if (sa !== 0) return sa;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
  const activeUsers = state.users.filter((u) => u.active !== false && u.deleted !== true);

  renderResultsMeta(rows.length, state.tasks.length);
  const groupMap = new Map();
  for (const t of rows) {
    const g = t.group || "General";
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g).push(t);
  }

  els.tasksTable.innerHTML = `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Due</th>
            <th>Group</th>
            <th>Labels</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(groupMap.entries())
            .map(([groupName, tasks]) => {
              const collapsed = state._collapsedGroups && state._collapsedGroups.has(groupName);
              const header = `
                <tr class="group-row" data-group="${escapeHtml(groupName)}">
                  <td colspan="6">
                    <button class="group-toggle" type="button" data-action="toggle-group" data-group="${escapeHtml(
                      groupName
                    )}">${collapsed ? "+" : "-"} </button>
                    ${escapeHtml(groupName)} <span class="muted">(${tasks.length})</span>
                  </td>
                </tr>
              `;
              if (collapsed) return header;
              const body = tasks
                .map(
                  (t) => `
            <tr data-id="${t.id}">
              <td><input class="cell" data-field="title" value="${escapeHtml(t.title)}" /></td>
              <td>
                <select class="cell" data-field="assigneeId" ${isManager() ? "" : "disabled"}>
                  ${activeUsers
                    .map(
                      (u) =>
                        `<option value="${escapeHtml(u.id)}" ${u.id === t.assigneeId ? "selected" : ""}>${escapeHtml(
                          u.displayName
                        )}</option>`
                    )
                    .join("")}
                </select>
              </td>
              <td>
                <select class="cell" data-field="status">
                  ${STATUS.map(
                    (s) => `<option value="${s.key}" ${t.status === s.key ? "selected" : ""}>${s.label}</option>`
                  ).join("")}
                </select>
              </td>
              <td><input class="cell" data-field="dueDate" type="date" value="${escapeHtml(t.dueDate || "")}" /></td>
              <td><input class="cell" data-field="group" value="${escapeHtml(t.group || "General")}" /></td>
              <td><input class="cell" data-field="labels" value="${escapeHtml((t.labels || []).join(", "))}" /></td>
            </tr>
          `
                )
                .join("");
              return header + body;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  if (!state._collapsedGroups) state._collapsedGroups = new Set();
  // Event delegation for table: one listener, no rebind storms.
  els.tasksTable.onclick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn && btn.dataset.action === "toggle-group") {
      const groupName = btn.dataset.group;
      if (state._collapsedGroups.has(groupName)) state._collapsedGroups.delete(groupName);
      else state._collapsedGroups.add(groupName);
      renderTable();
      return;
    }
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    if (e.target && e.target.classList.contains("cell")) return;
    state.selectedTaskId = tr.dataset.id;
    renderDetails();
  };
  els.tasksTable.onchange = (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("cell")) return;
    inlineUpdateRow(el);
  };
  els.tasksTable.onblur = (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("cell")) return;
    inlineUpdateRow(el);
  };
}

function renderResultsMeta(shown, total) {
  if (!els.resultsMeta) return;
  const parts = [];
  parts.push(`Показва: ${shown} / ${total}`);
  const active = [];
  if (state.search) active.push(`search="${state.search}"`);
  if (state.status) active.push(`status=${state.status}`);
  if (state.due) active.push(`due=${state.due}`);
  if (state.group) active.push(`group=${state.group}`);
  if (state.label) active.push(`label=${state.label}`);
  if (isManager() && state.filter !== "all") active.push(`assignee=${state.filter}`);
  els.resultsMeta.textContent = active.length ? `${parts.join(" ")} | ${active.join(", ")}` : parts.join(" ");
}
const inlineTimers = new Map();
function inlineUpdateRow(el) {
  const tr = el.closest("tr[data-id]");
  if (!tr) return;
  const taskId = tr.dataset.id;
  const field = el.dataset.field;
  if (!field) return;
  const key = `${taskId}:${field}`;
  if (inlineTimers.has(key)) clearTimeout(inlineTimers.get(key));
  inlineTimers.set(
    key,
    setTimeout(async () => {
      inlineTimers.delete(key);
      const payload = {};
      if (field === "labels") {
        payload.labels = String(el.value || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      } else {
        payload[field] = el.value;
      }
      try {
        const result = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
        // Update local state without a full reload (keeps the table stable).
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) state.tasks[idx] = result.task;
        if (state.selectedTaskId === taskId) renderDetails();
        // Mark audit as dirty; refresh only when Activity is opened or manually refreshed.
        state._auditDirty = true;
        // If the edit makes the row no longer match filters, re-render the table/board.
        if (state.route === "board") {
          if (state.boardView === "kanban") renderBoard();
          else renderTable();
        }
      } catch (e) {
        alert(e.message);
      }
    }, 400)
  );
}

function renderDetails() {
  const task = state.tasks.find((t) => t.id === state.selectedTaskId);
  if (!task) {
    els.detailPanel.innerHTML = `
      <h3>Детайли</h3>
      <p class="muted">Избери задача от борда.</p>
    `;
    return;
  }

  const manager = isManager();
  const seenItems = task.seenBy
    .slice()
    .sort((a, b) => b.at - a.at)
    .map(
      (item) =>
        `<p class="seen-item"><strong>${escapeHtml(item.displayName)}</strong> - ${formatDate(item.at)}</p>`
    )
    .join("");

  const activityItems = task.activity
    .slice()
    .sort((a, b) => b.at - a.at)
    .map(
      (a) => `<p class="activity-item"><strong>${escapeHtml(a.byUser.displayName)}</strong> - ${escapeHtml(
        a.action
      )}<br>${escapeHtml(a.detail)}<br><span class="muted">${formatDate(a.at)}</span></p>`
    )
    .join("");

  const assigneeOptions = (manager ? state.users : state.users.filter((u) => u.id === state.me.id))
    .filter((u) => u.active !== false || u.id === task.assigneeId)
    .map(
      (u) =>
        `<option value="${escapeHtml(u.id)}" ${u.id === task.assigneeId ? "selected" : ""}>${escapeHtml(
          u.active === false ? `${u.displayName} (inactive)` : u.displayName
        )}</option>`
    )
    .join("");

  els.detailPanel.innerHTML = `
    <h3>Детайли</h3>
    <div class="detail-grid">
      <label>
        Заглавие
        <input id="editTitle" value="${escapeHtml(task.title)}" />
      </label>
      <label>
        Описание
        <textarea id="editDescription" rows="3">${escapeHtml(task.description)}</textarea>
      </label>
      <label>
        Отговорник
        <select id="editAssignee" ${manager ? "" : "disabled"}>
          ${assigneeOptions}
        </select>
      </label>
      <label>
        Статус
        <select id="editStatus">
          ${STATUS.map(
            (s) => `<option value="${s.key}" ${task.status === s.key ? "selected" : ""}>${s.label}</option>`
          ).join("")}
        </select>
      </label>
      <label>
        Краен срок
        <input id="editDueDate" type="date" value="${escapeHtml(task.dueDate || "")}" />
      </label>
      <label>
        Група
        <input id="editGroup" value="${escapeHtml(task.group || "General")}" />
      </label>
      <label>
        Етикети (със запетая)
        <input id="editLabels" value="${escapeHtml((task.labels || []).join(", "))}" />
      </label>
      <button id="saveTaskBtn" type="button">Запази промени</button>
    </div>
    <h4>Кой е видял задачата</h4>
    <div class="seen-list">
      ${seenItems || `<p class="muted">Все още никой не е отварял задачата.</p>`}
    </div>
    <h4>История на промените</h4>
    <div class="activity-list">
      ${activityItems || `<p class="muted">Няма активност.</p>`}
    </div>
  `;

  document.getElementById("saveTaskBtn").addEventListener("click", async () => {
    await saveTaskChanges(task.id);
  });
}

async function saveTaskChanges(taskId) {
  const payload = {
    title: document.getElementById("editTitle").value.trim(),
    description: document.getElementById("editDescription").value.trim(),
    assigneeId: document.getElementById("editAssignee").value,
    status: document.getElementById("editStatus").value,
    dueDate: document.getElementById("editDueDate").value,
    group: document.getElementById("editGroup").value,
    labels: document
      .getElementById("editLabels")
      .value.split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  };
  try {
    await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
    await loadTasks();
    if (isManager()) await loadAudit();
    renderShell();
  } catch (e) {
    alert(e.message);
  }
}

async function onAddUser() {
  if (!isManager()) return;
  const username = els.newUserUsername.value.trim().toLowerCase();
  const displayName = els.newUserInput.value.trim();
  const phone = els.newUserPhone.value.trim();
  const password = els.newUserPassword.value;
  if (!username || !displayName || password.length < 6) {
    alert("Попълни username, име и парола (мин. 6 символа).");
    return;
  }
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, displayName, phone, password, role: els.newUserRole.value }),
    });
    els.newUserUsername.value = "";
    els.newUserInput.value = "";
    els.newUserPhone.value = "";
    els.newUserPassword.value = "";
    await loadUsers();
    if (isManager()) await loadAudit();
    renderShell();
  } catch (e) {
    alert(e.message);
  }
}

function renderUserAdmin() {
  if (!isManager()) return;
  const activeManagers = state.users.filter((u) => u.role === "manager" && u.active !== false && u.deleted !== true).length;
  els.userAdminList.innerHTML = state.users
    .map((u) => {
      const isSelf = u.id === state.me.id;
      const isDeleted = u.deleted === true;
      const canToggle =
        !isSelf &&
        !isDeleted &&
        !(u.role === "manager" && u.active !== false && activeManagers <= 1);
      const canDelete = !isSelf && !isDeleted && !(u.role === "manager" && u.active !== false && activeManagers <= 1);
      const statusClass = isDeleted ? "status-deleted" : u.active === false ? "status-inactive" : "status-active";
      return `
      <div class="user-row">
        <h4>
          ${escapeHtml(u.displayName)} (@${escapeHtml(u.username)})
          <span class="status-pill ${statusClass}">
            ${isDeleted ? "deleted" : u.active === false ? "inactive" : "active"}
          </span>
        </h4>
        <p class="muted">Роля: ${ROLE_LABELS[u.role]}</p>
        <div class="user-actions">
          <input type="text" id="phone-${u.id}" placeholder="+359..." value="${escapeHtml(u.phone || "")}" ${
            isDeleted ? "disabled" : ""
          } />
          <button class="btn-secondary" type="button" data-action="save-phone" data-user-id="${u.id}" ${
            isDeleted ? "disabled" : ""
          }>
            Запази телефон
          </button>
          <input type="password" id="pwd-${u.id}" placeholder="нова парола (мин 6)" ${isDeleted ? "disabled" : ""} />
          <button class="btn-secondary" type="button" data-action="reset-password" data-user-id="${u.id}" ${
            isDeleted ? "disabled" : ""
          }>
            Смени парола
          </button>
          <button class="btn-secondary" type="button" data-action="force-logout" data-user-id="${u.id}" ${
            isDeleted ? "disabled" : ""
          }>
            Force logout
          </button>
          <button
            class="btn-secondary"
            type="button"
            data-action="toggle-active"
            data-user-id="${u.id}"
            ${canToggle ? "" : "disabled"}
          >
            ${u.active === false ? "Активирай" : "Деактивирай"}
          </button>
          <button
            class="btn-secondary"
            type="button"
            data-action="delete-user"
            data-user-id="${u.id}"
            ${canDelete ? "" : "disabled"}
          >
            Изтрий (soft)
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

async function onUserAdminClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn || !isManager()) return;
  const userId = btn.dataset.userId;
  const action = btn.dataset.action;
  const user = state.users.find((u) => u.id === userId);
  if (!user) return;

  if (action === "save-phone") {
    const input = document.getElementById(`phone-${userId}`);
    const phone = input ? input.value.trim() : "";
    try {
      await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ phone }) });
      await loadUsers();
      if (isManager()) await loadAudit();
      renderShell();
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  if (action === "reset-password") {
    const input = document.getElementById(`pwd-${userId}`);
    const password = input ? input.value : "";
    if (!password || password.length < 6) {
      alert("Въведи нова парола с минимум 6 символа.");
      return;
    }
    try {
      await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ password }) });
      if (input) input.value = "";
      if (isManager()) await loadAudit();
      alert(`Паролата на ${user.displayName} е сменена.`);
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  if (action === "force-logout") {
    if (!confirm(`Force logout на ${user.displayName}?`)) return;
    try {
      await api(`/api/users/${userId}/logout`, { method: "POST", body: "{}" });
      if (isManager()) await loadAudit();
      alert("Сесиите са прекратени.");
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  if (action === "toggle-active") {
    const nextActive = user.active === false;
    try {
      await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ active: nextActive }) });
      await loadUsers();
      if (isManager()) await loadAudit();
      renderShell();
    } catch (e) {
      alert(e.message);
    }
    return;
  }

  if (action === "delete-user") {
    if (!confirm(`Сигурен ли си, че искаш да изтриеш (soft) ${user.displayName}?`)) return;
    try {
      await api(`/api/users/${userId}`, { method: "DELETE" });
      await loadUsers();
      if (isManager()) await loadAudit();
      renderShell();
    } catch (e) {
      alert(e.message);
    }
  }
}

function renderNotifBadge() {
  els.notifBadge.textContent = String(state.unread || 0);
  els.notifBadge.style.opacity = state.unread ? "1" : "0.45";
}

function renderNotifications() {
  const items = state.notifications || [];
  if (!items.length) {
    els.notifList.innerHTML = `<p class="muted">Няма нотификации.</p>`;
    return;
  }
  els.notifList.innerHTML = items
    .slice(0, 80)
    .map((n) => {
      const unread = !n.readAt;
      return `
        <div class="notif-item ${unread ? "notif-unread" : ""}">
          <div>${escapeHtml(n.message || "")}</div>
          <div class="notif-meta">
            ${formatDate(n.createdAt)}
            ${
              unread
                ? `| <button class="btn-secondary" data-action="read-notif" data-id="${n.id}" type="button">Прочетена</button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");
}

async function onNotifClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action !== "read-notif") return;
  const id = btn.dataset.id;
  try {
    await api(`/api/notifications/${id}/read`, { method: "POST", body: "{}" });
    await loadNotifications();
    renderNotificationsRoute();
  } catch (e) {
    alert(e.message);
  }
}

async function onReadAllNotifs() {
  try {
    await api("/api/notifications/read-all", { method: "POST", body: "{}" });
    await loadNotifications();
    renderNotificationsRoute();
  } catch (e) {
    alert(e.message);
  }
}

async function enableWebNotifications() {
  if (!("Notification" in window)) {
    alert("Този браузър не поддържа нотификации.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert("Нотификациите не са разрешени.");
    return;
  }
  alert("ОК. Ще показвам браузърни нотификации при приключени задачи.");
}

function maybeShowWebNotifications() {
  if (!isManager()) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  for (const n of state.notifications || []) {
    if (seenNotifIds.has(n.id)) continue;
    seenNotifIds.add(n.id);
    if (n.type === "task_done" && !n.readAt) {
      try {
        new Notification("Задача приключена", { body: n.message || "" });
      } catch {}
    }
  }
}

function renderAuditFilters() {
  if (!isManager()) return;
  const actorOptions = [
    `<option value="">Всички хора</option>`,
    ...state.users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)}</option>`),
  ].join("");
  els.auditActorFilter.innerHTML = actorOptions;
  els.auditActorFilter.value = state.auditFilters.actorUserId || "";
  els.auditEntityFilter.value = state.auditFilters.entityType || "";
}

function renderAudit() {
  if (!isManager()) return;
  const items = state.audit || [];
  if (!items.length) {
    els.auditList.innerHTML = `<p class="muted">Няма активност.</p>`;
    return;
  }
  els.auditList.innerHTML = items
    .map((a) => {
      const actor = a.actor ? `${a.actor.displayName} (@${a.actor.username})` : "Unknown";
      const meta = `${formatDate(a.at)} | ${escapeHtml(actor)} | ${escapeHtml(a.action)}`;
      return `
        <div class="audit-item">
          <div><strong>${escapeHtml(a.detail || a.action)}</strong></div>
          <div class="notif-meta">${meta}</div>
        </div>
      `;
    })
    .join("");
}

function formatDate(ts) {
  return new Date(ts).toLocaleString("bg-BG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
