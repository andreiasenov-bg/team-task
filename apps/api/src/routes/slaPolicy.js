const express = require("express");
const { badRequest, forbidden } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { getSlaPolicy, updateSlaPolicy } = require("../services/slaPolicy");

const router = express.Router();

function ensurePrivileged(role) {
  if (!["admin", "manager"].includes(role)) throw forbidden("Only admin/manager can manage SLA policy");
}

function validatePayload(body) {
  const allowed = ["enabled", "defaultHours", "repeatHours", "maxReminders", "escalationHours", "scanEverySeconds"];
  const keys = Object.keys(body || {});
  const unknown = keys.filter((k) => !allowed.includes(k));
  if (unknown.length > 0) throw badRequest(`Unknown SLA policy fields: ${unknown.join(", ")}`);
  return body || {};
}

router.get("/admin/sla-policy", requireAuth, async (req, res, next) => {
  try {
    ensurePrivileged(req.auth.role);
    const policy = await getSlaPolicy();
    res.json({ policy });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/sla-policy", requireAuth, async (req, res, next) => {
  try {
    ensurePrivileged(req.auth.role);
    const payload = validatePayload(req.body);
    const policy = await updateSlaPolicy(payload, req.auth.sub);
    res.json({ policy });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

