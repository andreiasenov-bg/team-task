let io = null;

function attachIO(instance) {
  io = instance;
}

function emitToProject(projectId, eventName, payload) {
  if (!io || !projectId) return;
  io.to(`project:${projectId}`).emit(eventName, payload);
}

function emitToUser(userId, eventName, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(eventName, payload);
}

function emitGlobal(eventName, payload) {
  if (!io) return;
  io.emit(eventName, payload);
}

module.exports = {
  attachIO,
  emitToProject,
  emitToUser,
  emitGlobal,
};
