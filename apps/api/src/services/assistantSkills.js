const { query } = require("../db");

const SKILLS = [
  {
    key: "my-open-tasks",
    title: "My Open Tasks",
    roles: ["admin", "manager", "employee"],
    description: "Shows your top open tasks.",
  },
  {
    key: "team-overview",
    title: "Team Overview",
    roles: ["admin", "manager"],
    description: "Shows open/in-progress/pending-review counters.",
  },
  {
    key: "whatsapp-queue",
    title: "WhatsApp Queue",
    roles: ["admin", "manager"],
    description: "Shows outbound queue health.",
  },
];

function listSkillsForRole(role) {
  const r = String(role || "").toLowerCase();
  return SKILLS.filter((s) => s.roles.includes(r));
}

function normalizeSkillName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function runMyOpenTasks(user) {
  const result = await query(
    `select id, title, status, priority, due_date
     from tasks
     where assigned_to = $1
       and archived_at is null
       and status <> 'done'
     order by
       case when due_date is null then 1 else 0 end,
       due_date asc,
       created_at desc
     limit 8`,
    [user.id]
  );
  if (result.rowCount === 0) return "Skill my-open-tasks: no open tasks.";
  const lines = result.rows.map((t) => {
    const due = t.due_date ? `, due ${new Date(t.due_date).toLocaleDateString("bg-BG")}` : "";
    return `• ${t.id.slice(0, 8)} | ${t.title} [${t.status}]${due}`;
  });
  return `Skill my-open-tasks:\n${lines.join("\n")}`;
}

async function runTeamOverview() {
  const result = await query(
    `select
       count(*) filter (where archived_at is null and status <> 'done')::int as open_count,
       count(*) filter (where archived_at is null and status = 'in_progress')::int as in_progress_count,
       count(*) filter (where archived_at is null and status = 'done' and review_status = 'pending')::int as pending_review_count,
       count(*) filter (where archived_at is null and status <> 'done' and due_date is not null and due_date < now())::int as overdue_count
     from tasks`
  );
  const x = result.rows[0] || {
    open_count: 0,
    in_progress_count: 0,
    pending_review_count: 0,
    overdue_count: 0,
  };
  return [
    "Skill team-overview:",
    `Open: ${x.open_count}`,
    `In progress: ${x.in_progress_count}`,
    `Pending review: ${x.pending_review_count}`,
    `Overdue: ${x.overdue_count}`,
  ].join("\n");
}

async function runWhatsappQueue() {
  const result = await query(
    `select
       count(*) filter (where status = 'pending')::int as pending_count,
       count(*) filter (where status = 'failed')::int as failed_count,
       count(*) filter (where status = 'sent')::int as sent_count
     from outbound_message_queue
     where channel = 'whatsapp'`
  );
  const x = result.rows[0] || { pending_count: 0, failed_count: 0, sent_count: 0 };
  return `Skill whatsapp-queue:\nPending: ${x.pending_count}\nFailed: ${x.failed_count}\nSent: ${x.sent_count}`;
}

function isSafeSelectQuery(sql) {
  const text = String(sql || "").trim();
  if (!text) return false;
  if (!/^select\b/i.test(text)) return false;
  if (text.includes(";")) return false;
  const blocked = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i;
  return !blocked.test(text);
}

async function listDynamicSkillsForRole(role) {
  const r = String(role || "").toLowerCase();
  const result = await query(
    `select id, skill_key, title, description, roles, enabled
     from assistant_dynamic_skills
     where enabled = true
       and $1 = any(roles)
     order by skill_key asc`,
    [r]
  );
  return result.rows.map((row) => ({
    key: row.skill_key,
    title: row.title,
    roles: row.roles || [],
    description: row.description,
    source: "dynamic",
    dynamicSkillId: row.id,
  }));
}

async function listSkillsForUser(user) {
  const builtins = listSkillsForRole(user.role).map((x) => ({ ...x, source: "builtin" }));
  const dynamic = await listDynamicSkillsForRole(user.role);
  return [...builtins, ...dynamic];
}

async function findDynamicSkill(skillName) {
  const key = normalizeSkillName(skillName);
  const result = await query(
    `select id, skill_key, title, description, roles, query_sql, enabled
     from assistant_dynamic_skills
     where skill_key = $1
       and enabled = true
     limit 1`,
    [key]
  );
  return result.rows[0] || null;
}

async function getSkillApprovalStatus(skillId, userId) {
  const result = await query(
    `select status
     from assistant_skill_approvals
     where skill_id = $1 and user_id = $2
     limit 1`,
    [skillId, userId]
  );
  return result.rows[0] ? result.rows[0].status : "missing";
}

async function requestSkillAccess(user, skillName) {
  const dynamic = await findDynamicSkill(skillName);
  if (!dynamic) return { ok: false, error: `Unknown dynamic skill: ${skillName}` };
  const role = String(user.role || "").toLowerCase();
  if (!(dynamic.roles || []).includes(role)) {
    return { ok: false, error: `Skill ${dynamic.skill_key} is not allowed for role ${user.role}` };
  }

  await query(
    `insert into assistant_skill_approvals (skill_id, user_id, status, note, requested_at, decided_at, decided_by)
     values ($1, $2, 'pending', null, now(), null, null)
     on conflict (skill_id, user_id)
     do update set status = 'pending', note = null, requested_at = now(), decided_at = null, decided_by = null`,
    [dynamic.id, user.id]
  );
  return { ok: true, message: `Request sent for skill ${dynamic.skill_key}.` };
}

async function decideSkillAccess(deciderUser, skillName, targetEmail, decision, note = "") {
  if (!["admin", "manager"].includes(String(deciderUser.role || "").toLowerCase())) {
    return { ok: false, error: "Only admin/manager can approve or reject skill requests." };
  }
  const dynamic = await findDynamicSkill(skillName);
  if (!dynamic) return { ok: false, error: `Unknown dynamic skill: ${skillName}` };
  const target = await query("select id, email from users where lower(email) = lower($1) limit 1", [targetEmail]);
  if (target.rowCount === 0) return { ok: false, error: `Unknown user email: ${targetEmail}` };
  const status = decision === "reject" ? "rejected" : "approved";
  await query(
    `insert into assistant_skill_approvals (skill_id, user_id, status, note, requested_at, decided_at, decided_by)
     values ($1, $2, $3, $4, now(), now(), $5)
     on conflict (skill_id, user_id)
     do update set status = excluded.status, note = excluded.note, decided_at = now(), decided_by = excluded.decided_by`,
    [dynamic.id, target.rows[0].id, status, String(note || "").slice(0, 500), deciderUser.id]
  );
  return { ok: true, message: `Skill ${dynamic.skill_key} ${status} for ${targetEmail}.` };
}

async function listPendingSkillRequests() {
  const result = await query(
    `select s.skill_key, u.email, a.requested_at
     from assistant_skill_approvals a
     join assistant_dynamic_skills s on s.id = a.skill_id
     join users u on u.id = a.user_id
     where a.status = 'pending'
     order by a.requested_at desc
     limit 30`
  );
  if (result.rowCount === 0) return "No pending skill requests.";
  const lines = result.rows.map((r) => `• ${r.skill_key} -> ${r.email}`);
  return `Pending skill requests:\n${lines.join("\n")}`;
}

async function runSkill(user, skillName) {
  const key = normalizeSkillName(skillName);
  const skill = SKILLS.find((s) => s.key === key);
  if (!skill) return { ok: false, error: `Unknown skill: ${skillName}` };
  if (!skill.roles.includes(String(user.role || "").toLowerCase())) {
    return { ok: false, error: `No access to skill ${skill.key} for role ${user.role}` };
  }

  if (skill.key === "my-open-tasks") return { ok: true, output: await runMyOpenTasks(user) };
  if (skill.key === "team-overview") return { ok: true, output: await runTeamOverview() };
  if (skill.key === "whatsapp-queue") return { ok: true, output: await runWhatsappQueue() };
  return { ok: false, error: `Skill not implemented: ${skill.key}` };
}

async function runAnySkill(user, skillName) {
  const key = normalizeSkillName(skillName);
  const builtin = SKILLS.find((s) => s.key === key);
  if (builtin) return runSkill(user, skillName);

  const dynamic = await findDynamicSkill(skillName);
  if (!dynamic) return { ok: false, error: `Unknown skill: ${skillName}` };
  const role = String(user.role || "").toLowerCase();
  if (!(dynamic.roles || []).includes(role)) {
    return { ok: false, error: `Skill ${dynamic.skill_key} is not allowed for role ${user.role}` };
  }
  const privileged = ["admin", "manager"].includes(role);
  if (!privileged) {
    const approval = await getSkillApprovalStatus(dynamic.id, user.id);
    if (approval !== "approved") {
      return { ok: false, error: `Skill ${dynamic.skill_key} is not approved for your user. Use: request skill ${dynamic.skill_key}` };
    }
  }
  if (!isSafeSelectQuery(dynamic.query_sql)) {
    return { ok: false, error: `Skill ${dynamic.skill_key} has unsafe SQL and cannot run.` };
  }

  const result = await query(dynamic.query_sql);
  const rows = result.rows || [];
  if (rows.length === 0) return { ok: true, output: `Skill ${dynamic.skill_key}: no rows.` };
  const sample = rows.slice(0, 8).map((r, i) => `${i + 1}. ${JSON.stringify(r)}`);
  return { ok: true, output: `Skill ${dynamic.skill_key}:\n${sample.join("\n")}` };
}

module.exports = {
  listSkillsForRole,
  listSkillsForUser,
  runSkill,
  runAnySkill,
  requestSkillAccess,
  decideSkillAccess,
  listPendingSkillRequests,
  isSafeSelectQuery,
};
