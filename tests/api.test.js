const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const PORT = 3301;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const DATA_FILE = path.join(__dirname, "..", "tmp-test-data.json");

class Client {
  constructor() {
    this.cookie = "";
  }

  async request(method, url, body) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0];
    }
    const json = await res.json();
    return { status: res.status, json };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`);
      if (res.ok) return;
    } catch {}
    await delay(120);
  }
  throw new Error("Server did not start in time");
}

async function main() {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);

  const server = spawn("node", ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      DATA_FILE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const anon = new Client();
    const meAnon = await anon.request("GET", "/api/auth/me");
    assert.equal(meAnon.status, 200);
    assert.equal(meAnon.json.user, null);
    const hiddenFile = await fetch(`${BASE_URL}/.git/config`);
    assert.equal(hiddenFile.status, 404);

    const manager = new Client();
    const managerLogin = await manager.request("POST", "/api/auth/login", {
      username: "manager",
      password: "admin123",
    });
    assert.equal(managerLogin.status, 200);
    assert.equal(managerLogin.json.user.role, "manager");

    const usersBefore = await manager.request("GET", "/api/users");
    assert.equal(usersBefore.status, 200);
    assert.ok(usersBefore.json.users.length >= 3);

    const createUser = await manager.request("POST", "/api/users", {
      username: "petar",
      displayName: "Петър",
      password: "petar123",
      role: "employee",
    });
    assert.equal(createUser.status, 201);
    const petarId = createUser.json.user.id;

    const createTask = await manager.request("POST", "/api/tasks", {
      title: "Тест задача за Петър",
      description: "QA flow",
      dueDate: "",
      assigneeId: petarId,
    });
    assert.equal(createTask.status, 201);
    const petarTaskId = createTask.json.task.id;

    const ivan = new Client();
    const ivanLogin = await ivan.request("POST", "/api/auth/login", {
      username: "ivan",
      password: "123456",
    });
    assert.equal(ivanLogin.status, 200);
    assert.equal(ivanLogin.json.user.role, "employee");

    const ivanUsers = await ivan.request("GET", "/api/users");
    assert.equal(ivanUsers.status, 200);
    assert.equal(ivanUsers.json.users.length, 1);
    assert.equal(ivanUsers.json.users[0].username, "ivan");

    const ivanTasks = await ivan.request("GET", "/api/tasks");
    assert.equal(ivanTasks.status, 200);
    assert.equal(ivanTasks.json.tasks.some((t) => t.id === petarTaskId), false);

    const ivanCantAddUser = await ivan.request("POST", "/api/users", {
      username: "x1",
      displayName: "X",
      password: "123456",
      role: "employee",
    });
    assert.equal(ivanCantAddUser.status, 403);
    const badUsername = await manager.request("POST", "/api/users", {
      username: "BAD USER",
      displayName: "Bad",
      password: "123456",
      role: "employee",
    });
    assert.equal(badUsername.status, 400);

    const ivanCantPatchOther = await ivan.request("PATCH", `/api/tasks/${petarTaskId}`, {
      title: "Attempt",
    });
    assert.equal(ivanCantPatchOther.status, 404);

    const ivanAudit = await ivan.request("GET", "/api/audit");
    assert.equal(ivanAudit.status, 403);

    const petar = new Client();
    const petarLogin = await petar.request("POST", "/api/auth/login", {
      username: "petar",
      password: "petar123",
    });
    assert.equal(petarLogin.status, 200);

    const petarTasks = await petar.request("GET", "/api/tasks");
    assert.equal(petarTasks.status, 200);
    assert.equal(petarTasks.json.tasks.some((t) => t.id === petarTaskId), true);

    const petarUpdate = await petar.request("PATCH", `/api/tasks/${petarTaskId}`, {
      status: "done",
    });
    assert.equal(petarUpdate.status, 200);
    assert.equal(petarUpdate.json.task.status, "done");

    const managerNotifs = await manager.request("GET", "/api/notifications");
    assert.equal(managerNotifs.status, 200);
    assert.ok(managerNotifs.json.unread >= 1);
    const doneNotif = managerNotifs.json.notifications.find((n) => n.type === "task_done" && n.taskId === petarTaskId);
    assert.ok(doneNotif);

    const markRead = await manager.request("POST", `/api/notifications/${doneNotif.id}/read`, {});
    assert.equal(markRead.status, 200);

    const audit = await manager.request("GET", "/api/audit");
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.json.audit));
    assert.ok(audit.json.audit.length >= 1);

    const resetPwd = await manager.request("PATCH", `/api/users/${petarId}`, {
      password: "newpass1",
    });
    assert.equal(resetPwd.status, 200);

    const deactivate = await manager.request("PATCH", `/api/users/${petarId}`, {
      active: false,
    });
    assert.equal(deactivate.status, 200);
    assert.equal(deactivate.json.user.active, false);

    const petarCantLogin = await petar.request("POST", "/api/auth/login", {
      username: "petar",
      password: "newpass1",
    });
    assert.equal(petarCantLogin.status, 401);

    // Move the task to an active user first, then ensure reassigning to inactive fails.
    const usersAfter = await manager.request("GET", "/api/users");
    assert.equal(usersAfter.status, 200);
    const ivanUser = usersAfter.json.users.find((u) => u.username === "ivan");
    assert.ok(ivanUser);
    const assignToIvan = await manager.request("PATCH", `/api/tasks/${petarTaskId}`, {
      assigneeId: ivanUser.id,
    });
    assert.equal(assignToIvan.status, 200);

    const cannotAssignInactive = await manager.request("PATCH", `/api/tasks/${petarTaskId}`, {
      assigneeId: petarId,
    });
    assert.equal(cannotAssignInactive.status, 400);

    // Force logout should invalidate an active session.
    const logoutIvan = await manager.request("POST", `/api/users/${ivanUser.id}/logout`, {});
    assert.equal(logoutIvan.status, 200);
    const ivanAfterLogout = await ivan.request("GET", "/api/tasks");
    assert.equal(ivanAfterLogout.status, 401);

    const softDelete = await manager.request("DELETE", `/api/users/${petarId}`);
    assert.equal(softDelete.status, 200);
    assert.equal(softDelete.json.user.deleted, true);
    assert.equal(softDelete.json.user.active, false);

    const managerTasksAfter = await manager.request("GET", "/api/tasks");
    assert.equal(managerTasksAfter.status, 200);
    const unknownTasksRoute = await manager.request("GET", "/api/tasks/not-a-list");
    assert.equal(unknownTasksRoute.status, 404);
    const editedTask = managerTasksAfter.json.tasks.find((t) => t.id === petarTaskId);
    assert.ok(editedTask);
    assert.equal(editedTask.status, "done");
    assert.ok(editedTask.activity.length >= 2);

    console.log("All API tests passed.");
  } finally {
    server.kill("SIGTERM");
    await delay(200);
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error("API tests failed:", error);
  process.exit(1);
});
