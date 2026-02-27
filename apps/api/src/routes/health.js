const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/health", async (_req, res, next) => {
  try {
    await query("select 1");
    res.json({
      ok: true,
      service: "listo-api",
      time: Date.now(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
