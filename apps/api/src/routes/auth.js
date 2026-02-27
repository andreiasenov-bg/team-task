const express = require("express");
const { query } = require("../db");
const { badRequest, unauthorized } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { signToken, verifyPassword } = require("../security");

const router = express.Router();

router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw badRequest("email and password are required");
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!normalizedEmail.includes("@")) throw badRequest("invalid email");

    const result = await query(
      "select id, name, email, role, password_hash from users where email = $1 and is_active = true limit 1",
      [normalizedEmail]
    );
    const user = result.rows[0];
    if (!user) throw unauthorized("Invalid credentials");

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw unauthorized("Invalid credentials");

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const result = await query("select id, name, email, role from users where id = $1 limit 1", [req.auth.sub]);
    const user = result.rows[0];
    if (!user) throw unauthorized("User no longer exists");
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
