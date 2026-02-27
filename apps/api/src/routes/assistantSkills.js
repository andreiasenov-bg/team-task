const express = require("express");
const { query } = require("../db");
const { badRequest, forbidden, notFound } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { listSkillsForUser, isSafeSelectQuery } = require("../services/assistantSkills");

const router = express.Router();

function isPrivileged(role) {
  return ["admin", "manager"].includes(String(role || "").toLowerCase());
}

function normalizeSkillKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function parseRoles(roles) {
  const arr = Array.isArray(roles) ? roles.map((r) => String(r || "").toLowerCase()) : [];
  const allowed = ["employee", "manager", "admin"];
  const filtered = Array.from(new Set(arr.filter((r) => allowed.includes(r))));
  return filtered.length > 0 ? filtered : ["employee", "manager", "admin"];
}

router.get("/assistant/skills", requireAuth, async (req, res, next) => {
  try {
    const includeAll = String(req.query.includeAll || "") === "1";
    if (includeAll && !isPrivileged(req.auth.role)) throw forbidden("Only admin/manager can list all skills");

    if (includeAll) {
      const dynamic = await query(
        `select id, skill_key, title, description, roles, enabled, created_at, updated_at
         from assistant_dynamic_skills
         order by skill_key asc`
      );
      return res.json({ skills: dynamic.rows });
    }

    const skills = await listSkillsForUser({ id: req.auth.sub, role: req.auth.role });
    res.json({ skills });
  } catch (error) {
    next(error);
  }
});

router.post("/assistant/skills", requireAuth, async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) throw forbidden("Only admin/manager can create skills");
    const skillKey = normalizeSkillKey(req.body && req.body.skillKey);
    const title = String((req.body && req.body.title) || "").trim();
    const description = String((req.body && req.body.description) || "").trim();
    const querySql = String((req.body && req.body.querySql) || "").trim();
    const roles = parseRoles(req.body && req.body.roles);
    if (!skillKey) throw badRequest("skillKey is required");
    if (!title) throw badRequest("title is required");
    if (!querySql) throw badRequest("querySql is required");
    if (!isSafeSelectQuery(querySql)) throw badRequest("querySql must be a safe single SELECT statement");

    const inserted = await query(
      `insert into assistant_dynamic_skills (skill_key, title, description, roles, query_sql, enabled, created_by)
       values ($1, $2, $3, $4::text[], $5, true, $6)
       returning id, skill_key, title, description, roles, enabled, created_at, updated_at`,
      [skillKey, title, description, roles, querySql, req.auth.sub]
    );
    res.status(201).json({ skill: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/assistant/skills/:skillKey", requireAuth, async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) throw forbidden("Only admin/manager can update skills");
    const skillKey = normalizeSkillKey(req.params.skillKey);
    if (!skillKey) throw badRequest("skillKey is required");
    const existing = await query(
      `select id, skill_key, title, description, roles, query_sql, enabled
       from assistant_dynamic_skills
       where skill_key = $1
       limit 1`,
      [skillKey]
    );
    if (existing.rowCount === 0) throw notFound("Skill not found");
    const current = existing.rows[0];

    const title = req.body && req.body.title != null ? String(req.body.title).trim() : current.title;
    const description = req.body && req.body.description != null ? String(req.body.description).trim() : current.description;
    const querySql = req.body && req.body.querySql != null ? String(req.body.querySql).trim() : current.query_sql;
    const roles = req.body && req.body.roles != null ? parseRoles(req.body.roles) : current.roles;
    const enabled = req.body && req.body.enabled != null ? Boolean(req.body.enabled) : Boolean(current.enabled);
    if (!title) throw badRequest("title cannot be empty");
    if (!querySql) throw badRequest("querySql cannot be empty");
    if (!isSafeSelectQuery(querySql)) throw badRequest("querySql must be a safe single SELECT statement");

    const updated = await query(
      `update assistant_dynamic_skills
       set title = $2,
           description = $3,
           roles = $4::text[],
           query_sql = $5,
           enabled = $6,
           updated_at = now()
       where skill_key = $1
       returning id, skill_key, title, description, roles, enabled, created_at, updated_at`,
      [skillKey, title, description, roles, querySql, enabled]
    );
    res.json({ skill: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/assistant/skill-approvals", requireAuth, async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) throw forbidden("Only admin/manager can list skill approvals");
    const status = String(req.query.status || "pending").toLowerCase();
    const where = ["1=1"];
    const params = [];
    if (["pending", "approved", "rejected"].includes(status)) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }
    const result = await query(
      `select a.id, a.status, a.note, a.requested_at, a.decided_at, s.skill_key, u.email as user_email, d.email as decided_by_email
       from assistant_skill_approvals a
       join assistant_dynamic_skills s on s.id = a.skill_id
       join users u on u.id = a.user_id
       left join users d on d.id = a.decided_by
       where ${where.join(" and ")}
       order by a.requested_at desc
       limit 100`,
      params
    );
    res.json({ approvals: result.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/assistant/skill-approvals/:approvalId", requireAuth, async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) throw forbidden("Only admin/manager can decide skill approvals");
    const approvalId = String(req.params.approvalId || "");
    const status = String((req.body && req.body.status) || "").toLowerCase();
    const note = String((req.body && req.body.note) || "").slice(0, 500);
    if (!["approved", "rejected"].includes(status)) throw badRequest("status must be approved or rejected");
    const existing = await query(
      `select id
       from assistant_skill_approvals
       where id = $1
       limit 1`,
      [approvalId]
    );
    if (existing.rowCount === 0) throw notFound("Approval not found");
    const updated = await query(
      `update assistant_skill_approvals
       set status = $2,
           note = $3,
           decided_at = now(),
           decided_by = $4
       where id = $1
       returning id, status, note, requested_at, decided_at`,
      [approvalId, status, note, req.auth.sub]
    );
    res.json({ approval: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
