/**
 * Logger utility that detects terminal output and provides appropriate formatting
 */

// Detect if we're in a terminal environment
const isTerminal = typeof process !== "undefined" && process.stdout?.isTTY;

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgCyan: "\x1b[46m",
};

// Styling for different log level badges
const levelStyles: Record<LogLevel, { text: string; color: string }> = {
  trace: { text: "TRACE", color: `${colors.dim}${colors.blue}` },
  debug: { text: "DEBUG", color: `${colors.dim}${colors.blue}` },
  info: { text: "INFO", color: colors.cyan },
  warn: { text: "WARN", color: colors.yellow },
  error: { text: "ERROR", color: colors.red },
};

export enum LogLevel {
  TRACE = "trace",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface LoggerOptions {
  name: string;
  level?: LogLevel;
  enabled?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export class Logger {
  private name: string;
  private level: LogLevel;
  private enabled: boolean;

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.level = options.level || LogLevel.INFO;
    this.enabled = options.enabled !== false;
  }

  private canLog(level: LogLevel): boolean {
    return this.enabled && LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatData(data: any[]): string {
    return data
      .map((d) => {
        if (typeof d === "object" && d !== null) {
          try {
            return JSON.stringify(d);
          } catch (e) {
            return String(d);
          }
        }
        return String(d);
      })
      .join(" ");
  }

  private log(level: LogLevel, message: string, ...data: any[]): void {
    if (!this.canLog(level)) return;

    const timestamp = new Date().toISOString();

    if (isTerminal) {
      // Terminal output with colors
      const timestampFormatted = `${colors.dim}[${timestamp}]${colors.reset}`;
      const levelFormatted = `${levelStyles[level].color}[${levelStyles[level].text}]${colors.reset}`;
      const nameFormatted = `${colors.magenta}[${this.name}]${colors.reset}`;
      const messageFormatted = `${colors.white}${message}${colors.reset}`;

      console[level](`${timestampFormatted} ${levelFormatted} ${nameFormatted} ${messageFormatted}`, ...data);
    } else {
      // JSON-friendly output for non-terminal environments
      const formattedData = this.formatData(data);
      console[level](
        `[${timestamp}] [${levelStyles[level].text}] [${this.name}] ${message}${formattedData ? " " + formattedData : ""}`,
      );
    }
  }

  debug(message: string, ...data: any[]): void {
    this.log(LogLevel.DEBUG, message, ...data);
  }

  info(message: string, ...data: any[]): void {
    this.log(LogLevel.INFO, message, ...data);
  }

  warn(message: string, ...data: any[]): void {
    this.log(LogLevel.WARN, message, ...data);
  }

  error(message: string, ...data: any[]): void {
    this.log(LogLevel.ERROR, message, ...data);
  }

  trace(message: string, ...data: any[]): void {
    this.log(LogLevel.TRACE, message, ...data);
  }
}

// Factory function to create loggers
export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}
