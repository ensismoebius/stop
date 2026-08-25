const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const configured = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "error" : "info");
const threshold = levels[configured] ?? levels.info;

function emit(level, message, meta) {
  if (levels[level] > threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (meta === undefined) {
    console[level === "debug" ? "log" : level](line);
  } else {
    console[level === "debug" ? "log" : level](line, meta);
  }
}

export const logger = {
  error: (message, meta) => emit("error", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  info: (message, meta) => emit("info", message, meta),
  debug: (message, meta) => emit("debug", message, meta),
};

export default logger;
