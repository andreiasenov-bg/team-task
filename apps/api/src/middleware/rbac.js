const { forbidden } = require("../errors");

function requireRole(...roles) {
  const allowed = new Set(roles);
  return function roleGuard(req, _res, next) {
    const role = req.auth && req.auth.role;
    if (!role || !allowed.has(role)) {
      return next(forbidden("Insufficient role"));
    }
    return next();
  };
}

module.exports = { requireRole };
