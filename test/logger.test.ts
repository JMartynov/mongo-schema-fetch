import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initLogger, logInfo, logWarn, logError, logDebug } from '../src/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, 'temp-logs');
const testLogPath = path.join(logDir, 'test-fetch.log');

describe('Logger Module Unit Tests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    if (fs.existsSync(logDir)) {
      fs.rmdirSync(logDir);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    if (fs.existsSync(logDir)) {
      fs.rmdirSync(logDir);
    }
  });

  it('should initialize and create the log file directory structure', () => {
    initLogger(testLogPath, false);
    expect(fs.existsSync(testLogPath)).toBe(true);
    const content = fs.readFileSync(testLogPath, 'utf8');
    expect(content).toBe('');
  });

  it('should write info logs to the file with UTC timestamps and print to console in normal mode', () => {
    initLogger(testLogPath, false);
    logInfo('Test Info Message');

    expect(console.log).toHaveBeenCalledWith('Test Info Message');
    const content = fs.readFileSync(testLogPath, 'utf8');
    expect(content).toContain('UTC');
    expect(content).toContain('[INFO] Test Info Message');
  });

  it('should strip ANSI escape codes when writing to the log file', () => {
    initLogger(testLogPath, false);
    logInfo('\x1b[36mColorized Info Message\x1b[0m');

    expect(console.log).toHaveBeenCalledWith('\x1b[36mColorized Info Message\x1b[0m');
    const content = fs.readFileSync(testLogPath, 'utf8');
    expect(content).toContain('Colorized Info Message');
    expect(content).not.toContain('\x1b[36m');
    expect(content).not.toContain('\x1b[0m');
  });

  it('should write warnings and errors and handle stack traces', () => {
    initLogger(testLogPath, false);
    logWarn('Warning message');
    logError('Error message', new Error('Something went wrong'));

    expect(console.warn).toHaveBeenCalledWith('Warning message');
    expect(console.error).toHaveBeenCalledWith('\x1b[31m❌ Error: Error message\x1b[0m');
    const content = fs.readFileSync(testLogPath, 'utf8');
    expect(content).toContain('[WARN] Warning message');
    expect(content).toContain('[ERROR] Error message');
    expect(content).toContain('Something went wrong');
  });

  it('should suppress all console output except error logging in machine mode', () => {
    initLogger(testLogPath, true);
    logInfo('Info in machine mode');
    logWarn('Warn in machine mode');
    logDebug('Debug in machine mode');

    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();

    logError('Fatal error in machine mode');
    expect(console.error).toHaveBeenCalledWith('Error: Fatal error in machine mode');

    const content = fs.readFileSync(testLogPath, 'utf8');
    expect(content).toContain('[INFO] Info in machine mode');
    expect(content).toContain('[WARN] Warn in machine mode');
    expect(content).toContain('[DEBUG] Debug in machine mode');
    expect(content).toContain('[ERROR] Fatal error in machine mode');
  });
});
