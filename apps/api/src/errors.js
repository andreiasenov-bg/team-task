class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function notFound(message = "Not found") {
  return new ApiError(404, message);
}

function badRequest(message = "Bad request") {
  return new ApiError(400, message);
}

function unauthorized(message = "Unauthorized") {
  return new ApiError(401, message);
}

function forbidden(message = "Forbidden") {
  return new ApiError(403, message);
}

module.exports = {
  ApiError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
};
