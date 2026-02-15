const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, "data.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const STATUS = new Set(["todo", "inprogress", "done"]);

const sessions = new Map();

function now() {
  return Date.now();
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeData(JSON.parse(raw));
  } catch {
    const seed = createSeedData();
    writeData(seed);
    return seed;
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function createSeedData() {
  const managerPassword = hashPassword("admin123");
  const employeePassword = hashPassword("123456");
  const users = [
    {
      id: crypto.randomUUID(),
      username: "manager",
      displayName: "Мениджър",
      role: "manager",
      active: true,
      passwordHash: managerPassword.hash,
      passwordSalt: managerPassword.salt,
      createdAt: now(),
    },
    {
      id: crypto.randomUUID(),
      username: "ivan",
      displayName: "Иван",
      role: "employee",
      active: true,
      passwordHash: employeePassword.hash,
      passwordSalt: employeePassword.salt,
      createdAt: now(),
    },
    {
      id: crypto.randomUUID(),
      username: "maria",
      displayName: "Мария",
      role: "employee",
      active: true,
      passwordHash: employeePassword.hash,
      passwordSalt: employeePassword.salt,
      createdAt: now(),
    },
  ];

  const task = {
    id: crypto.randomUUID(),
    title: "Седмичен отчет",
    description: "Събери KPI и изпрати PDF до 17:00.",
    assigneeId: users[1].id,
    dueDate: "",
    status: "todo",
    createdAt: now(),
    createdById: users[0].id,
    seenBy: {},
    activity: [
      {
        at: now(),
        byUserId: users[0].id,
        action: "Създадена задача",
        detail: "Отговорник: Иван",
      },
    ],
  };

  return { users, tasks: [task] };
}

function normalizeData(raw) {
  const users = (Array.isArray(raw.users) ? raw.users : []).map((user) => ({
    ...user,
    active: user.active !== false,
    deleted: user.deleted === true,
    deletedAt: user.deletedAt ? Number(user.deletedAt) : undefined,
  }));
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return { users, tasks };
}

function hashPassword(password, salt) {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, actualSalt, 64).toString("hex");
  return { salt: actualSalt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, chunk) => {
    const [k, ...v] = chunk.trim().split("=");
    acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk.toString();
      if (body.length > 1_000_000) {
        settled = true;
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (settled) return;
      if (!body) return resolve({});
      try {
        settled = true;
        resolve(JSON.parse(body));
      } catch {
        settled = true;
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", () => {
      if (settled) return;
      settled = true;
      reject(new Error("Invalid request body"));
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_TTL_MS / 1000;
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function authenticate(req, data) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < now()) {
    sessions.delete(token);
    return null;
  }
  const user = data.users.find((u) => u.id === session.userId);
  if (!user || user.active === false || user.deleted === true) return null;
  session.expiresAt = now() + SESSION_TTL_MS;
  return { user, token };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active !== false,
    deleted: user.deleted === true,
    deletedAt: user.deletedAt || null,
  };
}

function revokeUserSessions(userId) {
  for (const [token, s] of sessions.entries()) {
    if (s.userId === userId) sessions.delete(token);
  }
}

function canViewTask(task, user) {
  if (user.role === "manager") return true;
  return task.assigneeId === user.id;
}

function enrichTask(task, data) {
  const assignee = data.users.find((u) => u.id === task.assigneeId);
  const createdBy = data.users.find((u) => u.id === task.createdById);
  const seenBy = Object.entries(task.seenBy || {}).map(([userId, timestamp]) => {
    const user = data.users.find((u) => u.id === userId);
    return {
      userId,
      username: user ? user.username : "unknown",
      displayName: user ? user.displayName : "Непознат",
      at: timestamp,
    };
  });
  const activity = (task.activity || []).map((item) => {
    const user = data.users.find((u) => u.id === item.byUserId);
    return {
      at: item.at,
      action: item.action,
      detail: item.detail,
      byUser: user
        ? { userId: user.id, username: user.username, displayName: user.displayName }
        : { userId: "", username: "unknown", displayName: "Непознат" },
    };
  });
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    assigneeName: assignee
      ? assignee.deleted === true
        ? `${assignee.displayName} (deleted)`
        : assignee.active === false
          ? `${assignee.displayName} (inactive)`
          : assignee.displayName
      : "Няма",
    dueDate: task.dueDate,
    status: task.status,
    createdAt: task.createdAt,
    createdBy: createdBy ? createdBy.displayName : "Непознат",
    seenBy,
    activity,
  };
}

function addActivity(task, userId, action, detail) {
  task.activity = task.activity || [];
  task.activity.push({
    at: now(),
    byUserId: userId,
    action,
    detail,
  });
}

function applyTaskChanges(task, body, actor, data) {
  const changes = [];
  if (typeof body.title === "string") {
    const next = body.title.trim();
    if (next && next !== task.title) {
      changes.push(`Заглавие: "${task.title}" -> "${next}"`);
      task.title = next;
    }
  }
  if (typeof body.description === "string" && body.description !== task.description) {
    changes.push("Описание е обновено");
    task.description = body.description;
  }
  if (typeof body.status === "string" && STATUS.has(body.status) && body.status !== task.status) {
    changes.push(`Статус: "${task.status}" -> "${body.status}"`);
    task.status = body.status;
  }
  if (typeof body.dueDate === "string" && body.dueDate !== task.dueDate) {
    changes.push(`Краен срок: "${task.dueDate || "-"}" -> "${body.dueDate || "-"}"`);
    task.dueDate = body.dueDate;
  }
  if (typeof body.assigneeId === "string" && body.assigneeId !== task.assigneeId) {
    const target = data.users.find((u) => u.id === body.assigneeId);
    if (target && target.active !== false) {
      const prev = data.users.find((u) => u.id === task.assigneeId);
      changes.push(`Отговорник: "${prev ? prev.displayName : "-"}" -> "${target.displayName}"`);
      task.assigneeId = target.id;
    } else if (target && target.active === false) {
      throw new Error("Невалиден отговорник (inactive)");
    } else {
      throw new Error("Невалиден отговорник");
    }
  }
  if (changes.length) {
    addActivity(task, actor.id, "Промяна", changes.join("; "));
  }
}

function requireAuth(req, res, data) {
  const session = authenticate(req, data);
  if (!session) {
    sendJson(res, 401, { error: "Not authenticated" });
    return null;
  }
  return session;
}

function routeStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (parsedUrl.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  let urlPath = "/index.html";
  if (parsedUrl.pathname !== "/") {
    try {
      urlPath = decodeURIComponent(parsedUrl.pathname);
    } catch {
      sendJson(res, 400, { error: "Bad request" });
      return;
    }
  }
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const pathSegments = safePath.split(/[\\/]/).filter(Boolean);
  if (pathSegments.some((segment) => segment.startsWith("."))) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const filePath = path.join(__dirname, safePath);
  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (filePath === DATA_FILE || filePath.endsWith("server.js")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  const data = readData();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = data.users.find((u) => u.username.toLowerCase() === username);
      if (!user || user.active === false || user.deleted === true || !verifyPassword(password, user)) {
        sendJson(res, 401, { error: "Грешно потребителско име или парола" });
        return;
      }
      const token = crypto.randomBytes(24).toString("hex");
      sessions.set(token, { userId: user.id, expiresAt: now() + SESSION_TTL_MS });
      setSessionCookie(res, token);
      sendJson(res, 200, { user: publicUser(user) });
      return;
    } catch {
      sendJson(res, 400, { error: "Невалидни данни" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const cookies = parseCookies(req);
    if (cookies.session) sessions.delete(cookies.session);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const session = authenticate(req, data);
    if (!session) {
      sendJson(res, 200, { user: null });
      return;
    }
    sendJson(res, 200, { user: publicUser(session.user) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/users") {
    const session = requireAuth(req, res, data);
    if (!session) return;
    const users = session.user.role === "manager" ? data.users.map(publicUser) : [publicUser(session.user)];
    sendJson(res, 200, { users });
    return;
  }

  if (req.method === "POST" && pathname === "/api/users") {
    const session = requireAuth(req, res, data);
    if (!session) return;
    if (session.user.role !== "manager") {
      sendJson(res, 403, { error: "Only manager can add users" });
      return;
    }
    try {
      const body = await parseBody(req);
      const username = String(body.username || "")
        .trim()
        .toLowerCase();
      const displayName = String(body.displayName || "").trim();
      const password = String(body.password || "");
      const role = body.role === "manager" ? "manager" : "employee";
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        sendJson(res, 400, {
          error: "Username: 3-30 символа, само малки букви, цифри, точка, тире или _",
        });
        return;
      }
      if (!username || !displayName || password.length < 6) {
        sendJson(res, 400, { error: "Попълни username, име и парола (мин. 6 символа)" });
        return;
      }
      if (data.users.some((u) => u.username.toLowerCase() === username)) {
        sendJson(res, 409, { error: "Този username вече съществува" });
        return;
      }
      const hashed = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        username,
        displayName,
        role,
        active: true,
        deleted: false,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        createdAt: now(),
      };
      data.users.push(user);
      writeData(data);
      sendJson(res, 201, { user: publicUser(user) });
      return;
    } catch {
      sendJson(res, 400, { error: "Невалидни данни" });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/tasks") {
    const session = requireAuth(req, res, data);
    if (!session) return;
    const assigneeId = parsedUrl.searchParams.get("assigneeId");
    let tasks = data.tasks.filter((task) => canViewTask(task, session.user));
    if (session.user.role === "manager" && assigneeId && assigneeId !== "all") {
      tasks = tasks.filter((task) => task.assigneeId === assigneeId);
    }
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    sendJson(res, 200, { tasks: tasks.map((t) => enrichTask(t, data)) });
    return;
  }

  const userPatchMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "PATCH" && userPatchMatch) {
    const session = requireAuth(req, res, data);
    if (!session) return;
    if (session.user.role !== "manager") {
      sendJson(res, 403, { error: "Only manager can update users" });
      return;
    }
    try {
      const body = await parseBody(req);
      const targetId = userPatchMatch[1];
      const target = data.users.find((u) => u.id === targetId);
      if (!target) {
        sendJson(res, 404, { error: "Потребителят не е намерен" });
        return;
      }
      if (target.deleted === true) {
        sendJson(res, 400, { error: "Потребителят е изтрит" });
        return;
      }

      if (typeof body.password === "string" && body.password.length > 0) {
        if (body.password.length < 6) {
          sendJson(res, 400, { error: "Паролата трябва да е поне 6 символа" });
          return;
        }
        const hashed = hashPassword(body.password);
        target.passwordHash = hashed.hash;
        target.passwordSalt = hashed.salt;
      }

      if (typeof body.active === "boolean") {
        if (target.id === session.user.id && body.active === false) {
          sendJson(res, 400, { error: "Не можеш да деактивираш себе си" });
          return;
        }
        if (target.role === "manager" && body.active === false) {
          const activeManagers = data.users.filter((u) => u.role === "manager" && u.active !== false);
          if (activeManagers.length <= 1) {
            sendJson(res, 400, { error: "Трябва да има поне един активен мениджър" });
            return;
          }
        }
        target.active = body.active;
        if (body.active === false) {
          revokeUserSessions(target.id);
        }
      }

      writeData(data);
      sendJson(res, 200, { user: publicUser(target) });
      return;
    } catch {
      sendJson(res, 400, { error: "Невалидни данни" });
      return;
    }
  }

  const userLogoutMatch = pathname.match(/^\/api\/users\/([^/]+)\/logout$/);
  if (req.method === "POST" && userLogoutMatch) {
    const session = requireAuth(req, res, data);
    if (!session) return;
    if (session.user.role !== "manager") {
      sendJson(res, 403, { error: "Only manager can force logout users" });
      return;
    }
    const targetId = userLogoutMatch[1];
    const target = data.users.find((u) => u.id === targetId);
    if (!target || target.deleted === true) {
      sendJson(res, 404, { error: "Потребителят не е намерен" });
      return;
    }
    revokeUserSessions(target.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  const userDeleteMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "DELETE" && userDeleteMatch) {
    const session = requireAuth(req, res, data);
    if (!session) return;
    if (session.user.role !== "manager") {
      sendJson(res, 403, { error: "Only manager can delete users" });
      return;
    }
    const targetId = userDeleteMatch[1];
    const target = data.users.find((u) => u.id === targetId);
    if (!target || target.deleted === true) {
      sendJson(res, 404, { error: "Потребителят не е намерен" });
      return;
    }
    if (target.id === session.user.id) {
      sendJson(res, 400, { error: "Не можеш да изтриеш себе си" });
      return;
    }
    if (target.role === "manager") {
      const activeManagers = data.users.filter((u) => u.role === "manager" && u.active !== false && u.deleted !== true);
      if (activeManagers.length <= 1) {
        sendJson(res, 400, { error: "Трябва да има поне един активен мениджър" });
        return;
      }
    }
    target.deleted = true;
    target.deletedAt = now();
    target.active = false;
    revokeUserSessions(target.id);
    writeData(data);
    sendJson(res, 200, { user: publicUser(target) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/tasks") {
    const session = requireAuth(req, res, data);
    if (!session) return;
    try {
      const body = await parseBody(req);
      const title = String(body.title || "").trim();
      if (!title) {
        sendJson(res, 400, { error: "Заглавието е задължително" });
        return;
      }
      const assigneeId =
        session.user.role === "manager"
          ? String(body.assigneeId || session.user.id)
          : session.user.id;
      const assignee = data.users.find((u) => u.id === assigneeId);
      if (!assignee || assignee.active === false) {
        sendJson(res, 400, { error: "Невалиден отговорник" });
        return;
      }
      const task = {
        id: crypto.randomUUID(),
        title,
        description: String(body.description || ""),
        assigneeId,
        dueDate: String(body.dueDate || ""),
        status: "todo",
        createdAt: now(),
        createdById: session.user.id,
        seenBy: {},
        activity: [],
      };
      addActivity(task, session.user.id, "Създадена задача", `Отговорник: ${assignee.displayName}`);
      data.tasks.unshift(task);
      writeData(data);
      sendJson(res, 201, { task: enrichTask(task, data) });
      return;
    } catch {
      sendJson(res, 400, { error: "Невалидни данни" });
      return;
    }
  }

  const seenMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/seen$/);
  if (req.method === "POST" && seenMatch) {
    const session = requireAuth(req, res, data);
    if (!session) return;
    const taskId = seenMatch[1];
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || !canViewTask(task, session.user)) {
      sendJson(res, 404, { error: "Задачата не е намерена" });
      return;
    }
    task.seenBy = task.seenBy || {};
    task.seenBy[session.user.id] = now();
    addActivity(task, session.user.id, "Преглед", "Отвори задачата");
    writeData(data);
    sendJson(res, 200, { ok: true });
    return;
  }

  const patchMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === "PATCH" && patchMatch) {
    const session = requireAuth(req, res, data);
    if (!session) return;
    const taskId = patchMatch[1];
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || !canViewTask(task, session.user)) {
      sendJson(res, 404, { error: "Задачата не е намерена" });
      return;
    }
    try {
      const body = await parseBody(req);
      if (session.user.role !== "manager") {
        body.assigneeId = session.user.id;
      }
      applyTaskChanges(task, body, session.user, data);
      task.seenBy = task.seenBy || {};
      task.seenBy[session.user.id] = now();
      writeData(data);
      sendJson(res, 200, { task: enrichTask(task, data) });
      return;
    } catch (e) {
      sendJson(res, 400, { error: e && e.message ? e.message : "Невалидни данни" });
      return;
    }
  }

  routeStatic(req, res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(() => {
    sendJson(res, 500, { error: "Internal server error" });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log("Demo login: manager / admin123");
});
