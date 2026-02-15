const ROLE_LABELS = {
  manager: "Мениджър",
  employee: "Служител",
};

const STATUS = [
  { key: "todo", label: "To Do", tagClass: "todo" },
  { key: "inprogress", label: "In Progress", tagClass: "inprogress" },
  { key: "done", label: "Done", tagClass: "done" },
];

const els = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  authError: document.getElementById("authError"),
  currentUserInfo: document.getElementById("currentUserInfo"),
  currentRoleBadge: document.getElementById("currentRoleBadge"),
  newUserUsername: document.getElementById("newUserUsername"),
  newUserInput: document.getElementById("newUserInput"),
  newUserPassword: document.getElementById("newUserPassword"),
  newUserRole: document.getElementById("newUserRole"),
  addUserBtn: document.getElementById("addUserBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  userAdminPanel: document.getElementById("userAdminPanel"),
  userAdminList: document.getElementById("userAdminList"),
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

const state = {
  me: null,
  users: [],
  tasks: [],
  selectedTaskId: null,
  filter: "all",
};

init();

async function init() {
  bindEvents();
  await restoreSession();
}

function bindEvents() {
  els.loginForm.addEventListener("submit", onLogin);
  els.logoutBtn.addEventListener("click", onLogout);
  els.addUserBtn.addEventListener("click", onAddUser);
  els.taskForm.addEventListener("submit", onCreateTask);
  els.assigneeFilter.addEventListener("change", async () => {
    state.filter = els.assigneeFilter.value;
    await loadTasks();
  });
  els.userAdminList.addEventListener("click", onUserAdminClick);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
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

function showAuth() {
  state.me = null;
  els.authView.classList.remove("hidden");
  els.appView.classList.add("hidden");
}

function showApp() {
  els.authView.classList.add("hidden");
  els.appView.classList.remove("hidden");
}

function isManager() {
  return state.me && state.me.role === "manager";
}

async function bootstrapApp() {
  showApp();
  await loadUsers();
  await loadTasks();
  renderAll();
}

async function onLogin(event) {
  event.preventDefault();
  els.authError.textContent = "";
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value.trim(),
        password: els.loginPassword.value,
      }),
    });
    state.me = result.user;
    els.loginForm.reset();
    await bootstrapApp();
  } catch (error) {
    els.authError.textContent = error.message;
  }
}

async function onLogout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    state.users = [];
    state.tasks = [];
    state.selectedTaskId = null;
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
  renderAll();
}

async function onAddUser() {
  if (!isManager()) return;
  const username = els.newUserUsername.value.trim().toLowerCase();
  const displayName = els.newUserInput.value.trim();
  const password = els.newUserPassword.value;
  if (!username || !displayName || password.length < 6) {
    alert("Попълни username, име и парола (мин. 6 символа).");
    return;
  }
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        username,
        displayName,
        password,
        role: els.newUserRole.value,
      }),
    });
    els.newUserUsername.value = "";
    els.newUserInput.value = "";
    els.newUserPassword.value = "";
    await loadUsers();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

async function onCreateTask(event) {
  event.preventDefault();
  const title = els.taskTitle.value.trim();
  if (!title) return;
  const assigneeId = isManager()
    ? els.taskAssignee.value || state.me.id
    : state.me.id;
  try {
    const result = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title,
        description: els.taskDescription.value.trim(),
        dueDate: els.taskDueDate.value || "",
        assigneeId,
      }),
    });
    els.taskForm.reset();
    state.selectedTaskId = result.task.id;
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

function renderAll() {
  if (!state.me) return;
  renderHeader();
  renderFilters();
  renderUserAdmin();
  renderBoard();
  renderDetails();
}

function renderHeader() {
  els.currentUserInfo.value = `${state.me.displayName} (@${state.me.username})`;
  els.currentRoleBadge.textContent = `Роля: ${ROLE_LABELS[state.me.role]}`;
  const manager = isManager();
  els.newUserUsername.disabled = !manager;
  els.newUserInput.disabled = !manager;
  els.newUserPassword.disabled = !manager;
  els.newUserRole.disabled = !manager;
  els.addUserBtn.disabled = !manager;
  els.taskAssignee.disabled = !manager;
  els.userAdminPanel.classList.toggle("hidden", !manager);
}

function renderFilters() {
  const manager = isManager();
  if (!manager) state.filter = "all";

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

  const activeUsers = state.users.filter((u) => u.active !== false);
  const assigneeUsers = manager ? activeUsers : activeUsers.filter((u) => u.id === state.me.id);
  els.taskAssignee.innerHTML = assigneeUsers
    .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)}</option>`)
    .join("");

  els.accessHint.textContent = manager
    ? "Мениджърски изглед: виждаш всички задачи."
    : "Служителски изглед: виждаш само твоите задачи.";
}

function renderUserAdmin() {
  if (!isManager()) return;
  const activeManagers = state.users.filter((u) => u.role === "manager" && u.active !== false).length;
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

  if (action === "reset-password") {
    const input = document.getElementById(`pwd-${userId}`);
    const password = input ? input.value : "";
    if (!password || password.length < 6) {
      alert("Въведи нова парола с минимум 6 символа.");
      return;
    }
    try {
      await api(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      if (input) input.value = "";
      alert(`Паролата на ${user.displayName} е сменена.`);
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (action === "toggle-active") {
    const nextActive = user.active === false;
    try {
      await api(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
      await loadUsers();
      await loadTasks();
    } catch (error) {
      alert(error.message);
    }
  }

  if (action === "force-logout") {
    if (!confirm(`Force logout на ${user.displayName}?`)) return;
    try {
      await api(`/api/users/${userId}/logout`, { method: "POST", body: "{}" });
      alert("Сесиите са прекратени.");
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (action === "delete-user") {
    if (!confirm(`Сигурен ли си, че искаш да изтриеш (soft) ${user.displayName}?`)) return;
    try {
      await api(`/api/users/${userId}`, { method: "DELETE" });
      await loadUsers();
      await loadTasks();
    } catch (error) {
      alert(error.message);
    }
  }
}

function renderBoard() {
  els.board.innerHTML = STATUS.map((s) => {
    const tasks = state.tasks.filter((t) => t.status === s.key);
    const cards = tasks
      .map(
        (t) => `
      <article class="card" data-id="${t.id}">
        <h4>${escapeHtml(t.title)}</h4>
        <p><strong>Отговорник:</strong> ${escapeHtml(t.assigneeName || "-")}</p>
        <p><strong>Краен срок:</strong> ${escapeHtml(t.dueDate || "-")}</p>
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
    });
  });
}

function renderDetails() {
  const task = state.tasks.find((t) => t.id === state.selectedTaskId);
  if (!task) {
    els.detailPanel.innerHTML = `
      <h2>Детайли</h2>
      <p class="muted">Избери задача от борда.</p>
    `;
    return;
  }

  const manager = isManager();
  const seenItems = task.seenBy
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((item) => `<p class="seen-item"><strong>${escapeHtml(item.displayName)}</strong> - ${formatDate(item.at)}</p>`)
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
    <h2>Детайли</h2>
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
      <button id="saveTaskBtn" type="button">Запази промени</button>
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
  };
  try {
    await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
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
