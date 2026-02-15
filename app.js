const STORAGE_KEY = "task-team-board-v1";

const ROLES = {
  manager: "manager",
  employee: "employee",
};

const ROLE_LABELS = {
  [ROLES.manager]: "Мениджър",
  [ROLES.employee]: "Служител",
};

const STATUS = [
  { key: "todo", label: "To Do", tagClass: "todo" },
  { key: "inprogress", label: "In Progress", tagClass: "inprogress" },
  { key: "done", label: "Done", tagClass: "done" },
];

const els = {
  currentUserSelect: document.getElementById("currentUserSelect"),
  currentRoleBadge: document.getElementById("currentRoleBadge"),
  newUserInput: document.getElementById("newUserInput"),
  newUserRole: document.getElementById("newUserRole"),
  addUserBtn: document.getElementById("addUserBtn"),
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskDescription: document.getElementById("taskDescription"),
  taskAssignee: document.getElementById("taskAssignee"),
  taskDueDate: document.getElementById("taskDueDate"),
  assigneeFilter: document.getElementById("assigneeFilter"),
  accessHint: document.getElementById("accessHint"),
  board: document.getElementById("board"),
  detailPanel: document.getElementById("detailPanel"),
};

const initialData = {
  users: [
    { name: "Мениджър", role: ROLES.manager },
    { name: "Иван", role: ROLES.employee },
    { name: "Мария", role: ROLES.employee },
  ],
  currentUser: "Мениджър",
  filter: "all",
  selectedTaskId: null,
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Седмичен отчет",
      description: "Събери KPI и изпрати PDF до 17:00.",
      assignee: "Иван",
      dueDate: "",
      status: "todo",
      createdAt: Date.now(),
      createdBy: "Мениджър",
      seenBy: {},
      activity: [],
    },
  ],
};

let state = loadState();
seedInitialActivity();
renderAll();
bindEvents();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(initialData);
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(initialData);
  }
}

function normalizeState(rawState) {
  const next = rawState && typeof rawState === "object" ? rawState : {};

  let users = Array.isArray(next.users) ? next.users : [];
  users = users
    .map((u, i) => {
      if (typeof u === "string") {
        return {
          name: u,
          role: i === 0 ? ROLES.manager : ROLES.employee,
        };
      }
      if (!u || typeof u.name !== "string") return null;
      return {
        name: u.name.trim(),
        role: u.role === ROLES.manager ? ROLES.manager : ROLES.employee,
      };
    })
    .filter(Boolean);

  if (!users.length) users = structuredClone(initialData.users);
  if (!users.some((u) => u.role === ROLES.manager)) users[0].role = ROLES.manager;

  const tasks = Array.isArray(next.tasks) ? next.tasks : [];
  const normalizedTasks = tasks.map((task) => ({
    id: task.id || crypto.randomUUID(),
    title: task.title || "Без заглавие",
    description: task.description || "",
    assignee: task.assignee || "",
    dueDate: task.dueDate || "",
    status: STATUS.some((s) => s.key === task.status) ? task.status : "todo",
    createdAt: Number(task.createdAt) || Date.now(),
    createdBy: task.createdBy || "Система",
    seenBy: task.seenBy && typeof task.seenBy === "object" ? task.seenBy : {},
    activity: Array.isArray(task.activity) ? task.activity : [],
  }));

  const currentUser = users.some((u) => u.name === next.currentUser)
    ? next.currentUser
    : users[0].name;

  return {
    users,
    currentUser,
    filter: typeof next.filter === "string" ? next.filter : "all",
    selectedTaskId: typeof next.selectedTaskId === "string" ? next.selectedTaskId : null,
    tasks: normalizedTasks,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedInitialActivity() {
  state.tasks.forEach((task) => {
    if (!task.activity.length) {
      task.activity.push({
        at: task.createdAt,
        by: task.createdBy,
        action: "Създадена задача",
        detail: "Начален запис",
      });
    }
  });
  saveState();
}

function bindEvents() {
  els.addUserBtn.addEventListener("click", addUser);
  els.taskForm.addEventListener("submit", createTask);
  els.currentUserSelect.addEventListener("change", () => {
    state.currentUser = els.currentUserSelect.value;
    if (state.selectedTaskId && !canViewTask(getTaskById(state.selectedTaskId))) {
      state.selectedTaskId = null;
    } else if (state.selectedTaskId) {
      markSeen(state.selectedTaskId);
    }
    saveState();
    renderAll();
  });
  els.assigneeFilter.addEventListener("change", () => {
    state.filter = els.assigneeFilter.value;
    saveState();
    renderBoard();
  });
}

function getTaskById(taskId) {
  return state.tasks.find((t) => t.id === taskId);
}

function getUser(name) {
  return state.users.find((u) => u.name === name);
}

function getCurrentUser() {
  return getUser(state.currentUser);
}

function isCurrentUserManager() {
  const user = getCurrentUser();
  return user && user.role === ROLES.manager;
}

function canViewTask(task) {
  if (!task) return false;
  if (isCurrentUserManager()) return true;
  return task.assignee === state.currentUser;
}

function canEditTask(task) {
  return canViewTask(task);
}

function addUser() {
  if (!isCurrentUserManager()) return;
  const name = els.newUserInput.value.trim();
  const role = els.newUserRole.value === ROLES.manager ? ROLES.manager : ROLES.employee;
  if (!name) return;
  if (state.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    els.newUserInput.value = "";
    return;
  }
  state.users.push({ name, role });
  state.currentUser = name;
  els.newUserInput.value = "";
  saveState();
  renderAll();
}

function createTask(e) {
  e.preventDefault();
  const title = els.taskTitle.value.trim();
  if (!title) return;

  const manager = isCurrentUserManager();
  const assignee = manager ? els.taskAssignee.value || state.currentUser : state.currentUser;
  const task = {
    id: crypto.randomUUID(),
    title,
    description: els.taskDescription.value.trim(),
    assignee,
    dueDate: els.taskDueDate.value || "",
    status: "todo",
    createdAt: Date.now(),
    createdBy: state.currentUser,
    seenBy: {},
    activity: [],
  };
  task.activity.push({
    at: Date.now(),
    by: state.currentUser,
    action: "Създадена задача",
    detail: `Отговорник: ${task.assignee || "няма"}`,
  });
  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  saveState();
  els.taskForm.reset();
  renderAll();
}

function getVisibleTasks() {
  if (isCurrentUserManager()) {
    return state.filter === "all"
      ? state.tasks
      : state.tasks.filter((t) => t.assignee === state.filter);
  }
  return state.tasks.filter((t) => t.assignee === state.currentUser);
}

function renderAll() {
  renderUserSelects();
  renderBoard();
  renderDetails();
}

function renderUserSelects() {
  const userOptions = state.users
    .map(
      (user) =>
        `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)} (${ROLE_LABELS[
          user.role
        ]})</option>`
    )
    .join("");

  els.currentUserSelect.innerHTML = userOptions;
  els.currentUserSelect.value = state.currentUser;

  const manager = isCurrentUserManager();
  els.currentRoleBadge.textContent = `Роля: ${
    manager ? ROLE_LABELS[ROLES.manager] : ROLE_LABELS[ROLES.employee]
  }`;

  const assigneeUsers = manager ? state.users : state.users.filter((u) => u.name === state.currentUser);
  const assigneeOptions = assigneeUsers
    .map((u) => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`)
    .join("");
  els.taskAssignee.innerHTML = assigneeOptions;
  els.taskAssignee.disabled = !manager;

  const filterOptions = [
    `<option value="all">Всички</option>`,
    ...state.users.map((u) => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`),
  ].join("");
  els.assigneeFilter.innerHTML = filterOptions;

  if (manager) {
    if (!state.filter) state.filter = "all";
    els.assigneeFilter.value = state.filter;
    els.assigneeFilter.disabled = false;
    els.accessHint.textContent = "Мениджърски изглед: виждаш всички задачи в дашборда.";
    els.newUserInput.disabled = false;
    els.newUserRole.disabled = false;
    els.addUserBtn.disabled = false;
  } else {
    state.filter = "all";
    els.assigneeFilter.value = "all";
    els.assigneeFilter.disabled = true;
    els.accessHint.textContent =
      "Служителски изглед: виждаш само твоите задачи. Нямаш достъп до задачите на други хора.";
    els.newUserInput.disabled = true;
    els.newUserRole.disabled = true;
    els.addUserBtn.disabled = true;
  }
}

function renderBoard() {
  const visibleTasks = getVisibleTasks();

  els.board.innerHTML = STATUS.map((s) => {
    const tasks = visibleTasks.filter((t) => t.status === s.key);
    const cards = tasks
      .map(
        (t) => `
        <article class="card" data-id="${t.id}">
          <h4>${escapeHtml(t.title)}</h4>
          <p><strong>Отговорник:</strong> ${escapeHtml(t.assignee || "-")}</p>
          <p><strong>Краен срок:</strong> ${escapeHtml(t.dueDate || "-")}</p>
          <p><strong>Видяно от:</strong> ${Object.keys(t.seenBy).length} души</p>
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
    card.addEventListener("click", () => {
      const task = getTaskById(card.dataset.id);
      if (!canViewTask(task)) return;
      state.selectedTaskId = card.dataset.id;
      markSeen(card.dataset.id);
      renderDetails();
      saveState();
    });
  });
}

function renderDetails() {
  const task = getTaskById(state.selectedTaskId);
  if (!task || !canViewTask(task)) {
    els.detailPanel.innerHTML = `
      <h2>Детайли</h2>
      <p class="muted">Избери задача от борда.</p>
    `;
    return;
  }

  const manager = isCurrentUserManager();
  const canEdit = canEditTask(task);
  const seenItems = Object.entries(task.seenBy)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([user, ts]) => `
      <p class="seen-item"><strong>${escapeHtml(user)}</strong> - ${formatDate(ts)}</p>
    `
    )
    .join("");

  const activityItems = task.activity
    .slice()
    .sort((a, b) => b.at - a.at)
    .map(
      (a) => `
      <p class="activity-item"><strong>${escapeHtml(a.by)}</strong> - ${escapeHtml(
        a.action
      )}<br>${escapeHtml(a.detail)}<br><span class="muted">${formatDate(a.at)}</span></p>
    `
    )
    .join("");

  const assigneeOptions = (manager ? state.users : state.users.filter((u) => u.name === state.currentUser))
    .map(
      (u) =>
        `<option value="${escapeHtml(u.name)}" ${
          u.name === task.assignee ? "selected" : ""
        }>${escapeHtml(u.name)}</option>`
    )
    .join("");

  els.detailPanel.innerHTML = `
    <h2>Детайли</h2>
    <div class="detail-grid">
      <label>
        Заглавие
        <input id="editTitle" value="${escapeHtml(task.title)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label>
        Описание
        <textarea id="editDescription" rows="3" ${canEdit ? "" : "disabled"}>${escapeHtml(
    task.description
  )}</textarea>
      </label>
      <label>
        Отговорник
        <select id="editAssignee" ${manager && canEdit ? "" : "disabled"}>
          ${assigneeOptions}
        </select>
      </label>
      <label>
        Статус
        <select id="editStatus" ${canEdit ? "" : "disabled"}>
          ${STATUS.map(
            (s) =>
              `<option value="${s.key}" ${
                task.status === s.key ? "selected" : ""
              }>${s.label}</option>`
          ).join("")}
        </select>
      </label>
      <label>
        Краен срок
        <input id="editDueDate" type="date" value="${escapeHtml(task.dueDate || "")}" ${
    canEdit ? "" : "disabled"
  } />
      </label>
      <button id="saveTaskBtn" type="button" ${canEdit ? "" : "disabled"}>Запази промени</button>
    </div>

    <h3>Кой е видял задачата</h3>
    <div class="seen-list">
      ${seenItems || `<p class="muted">Все още никой не е отварял задачата.</p>`}
    </div>

    <h3>История на промените</h3>
    <div class="activity-list">
      ${activityItems || `<p class="muted">Няма активност.</p>`}
    </div>
  `;

  document.getElementById("saveTaskBtn").addEventListener("click", () => {
    saveTaskChanges(task.id);
  });
}

function saveTaskChanges(taskId) {
  const task = getTaskById(taskId);
  if (!task || !canEditTask(task)) return;

  const updates = {
    title: document.getElementById("editTitle").value.trim(),
    description: document.getElementById("editDescription").value.trim(),
    assignee: isCurrentUserManager()
      ? document.getElementById("editAssignee").value
      : state.currentUser,
    status: document.getElementById("editStatus").value,
    dueDate: document.getElementById("editDueDate").value,
  };

  applyChange(task, "Заглавие", "title", updates.title);
  applyChange(task, "Описание", "description", updates.description);
  applyChange(task, "Отговорник", "assignee", updates.assignee);
  applyChange(task, "Статус", "status", updates.status);
  applyChange(task, "Краен срок", "dueDate", updates.dueDate);

  markSeen(task.id);
  saveState();
  renderAll();
}

function applyChange(task, label, key, nextValue) {
  const prev = task[key] || "";
  const next = nextValue || "";
  if (prev === next) return;
  task[key] = nextValue;
  task.activity.push({
    at: Date.now(),
    by: state.currentUser,
    action: "Промяна",
    detail: `${label}: "${prev || "-"}" -> "${next || "-"}"`,
  });
}

function markSeen(taskId) {
  const task = getTaskById(taskId);
  if (!task || !canViewTask(task)) return;
  task.seenBy[state.currentUser] = Date.now();
  task.activity.push({
    at: Date.now(),
    by: state.currentUser,
    action: "Преглед",
    detail: "Отвори задачата",
  });
  saveState();
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
