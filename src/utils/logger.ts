/**
 * Minimal logging utility for three-cad-viewer.
 *
 * Provides leveled logging that can be controlled by library consumers.
 * Default level is "warn" (only warnings and errors shown).
 *
 * @example
 * // Library consumer can enable debug output:
 * import { logger } from "three-cad-viewer";
 * logger.setLevel("debug");
 *
 * @example
 * // Silence all logging:
 * logger.setLevel("silent");
 */

/** Available log levels in order of verbosity */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

let currentLevel: LogLevel = "warn";

/**
 * Logger instance for three-cad-viewer.
 *
 * Methods: debug, info, warn, error
 * Control: setLevel(), getLevel()
 */
export const logger = {
  /**
   * Set the minimum log level. Messages below this level are suppressed.
   * @param level - The minimum level to display
   */
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },

  /**
   * Get the current log level.
   * @returns The current minimum log level
   */
  getLevel(): LogLevel {
    return currentLevel;
  },

  /**
   * Log debug message (verbose, for development).
   * Only shown when level is "debug".
   */
  debug(...args: unknown[]): void {
    if (levels[currentLevel] <= levels.debug) {
      console.log("[three-cad-viewer]", ...args);
    }
  },

  /**
   * Log info message (general information).
   * Shown when level is "debug" or "info".
   */
  info(...args: unknown[]): void {
    if (levels[currentLevel] <= levels.info) {
      console.log("[three-cad-viewer]", ...args);
    }
  },

  /**
   * Log warning message (potential issues).
   * Shown when level is "debug", "info", or "warn".
   */
  warn(...args: unknown[]): void {
    if (levels[currentLevel] <= levels.warn) {
      console.warn("[three-cad-viewer]", ...args);
    }
  },

  /**
   * Log error message (failures).
   * Shown unless level is "silent".
   */
  error(...args: unknown[]): void {
    if (levels[currentLevel] <= levels.error) {
      console.error("[three-cad-viewer]", ...args);
    }
  },
};
