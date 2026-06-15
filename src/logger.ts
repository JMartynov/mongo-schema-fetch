import fs from 'fs';
import path from 'path';

let logFilePath: string | null = null;
let machineMode = false;

/**
 * Initialize the logger configuration.
 * @param filePath Path to the log file (null if file logging is disabled).
 * @param isMachine True to enable headless machine mode.
 */
export function initLogger(filePath: string | null, isMachine: boolean) {
  machineMode = isMachine;
  if (filePath) {
    logFilePath = path.resolve(filePath);
    const dir = path.dirname(logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Clear/truncate the log file on startup
    fs.writeFileSync(logFilePath, '', 'utf-8');
  }
}

/**
 * Helper to generate current UTC timestamp in the format YYYY-MM-DD HH:mm:ss UTC
 */
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

/**
 * Writes a log message to the log file if initialized, stripping ANSI escape colors.
 */
function writeToFile(level: string, message: string) {
  if (logFilePath) {
    const timestamp = getTimestamp();
    // Regular expression to strip ANSI escape codes (colors)
    const cleanMsg = message.replace(/\x1b\[[0-9;]*m/g, '');
    fs.appendFileSync(logFilePath, `[${timestamp}] [${level}] ${cleanMsg}\n`, 'utf-8');
  }
}

/**
 * Log informational messages.
 */
export function logInfo(msg: string) {
  writeToFile('INFO', msg);
  if (!machineMode) {
    console.log(msg);
  }
}

/**
 * Log warning messages.
 */
export function logWarn(msg: string) {
  writeToFile('WARN', msg);
  if (!machineMode) {
    console.warn(msg);
  }
}

/**
 * Log error messages. Fatals in machine mode write only the message to stderr.
 */
export function logError(msg: string, err?: any) {
  const errMsg = err ? `${msg}\n${err.stack || err.message || err}` : msg;
  writeToFile('ERROR', errMsg);

  let consoleMsg = msg;
  if (!consoleMsg.startsWith('Error:')) {
    consoleMsg = `Error: ${consoleMsg}`;
  }

  if (machineMode) {
    console.error(consoleMsg);
  } else {
    console.error(`\x1b[31m❌ ${consoleMsg}\x1b[0m`);
  }
}

/**
 * Log debug level messages (written only to file, never to console).
 */
export function logDebug(msg: string) {
  writeToFile('DEBUG', msg);
}
