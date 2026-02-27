const { unauthorized } = require("../errors");
const { verifyToken } = require("../security");

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(unauthorized("Missing bearer token"));

  try {
    req.auth = verifyToken(token);
    return next();
  } catch {
    return next(unauthorized("Invalid token"));
  }
}

module.exports = { requireAuth };
