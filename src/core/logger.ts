// ---------------------------------------------------------------------------
// skill-unit logger -- colored, leveled logging for all scripts
//
// Usage:
//   const log = createLogger('runner');
//   log.info('Starting test execution');
//   log.success('All tests passed');
//   log.warn('Fixture path not found');
//   log.error('Failed to read manifest');
//   log.verbose('CLI args: claude --print ...');
//   log.debug('Raw event: { type: "assistant" ... }');
//
// Log levels (in order of severity):
//   debug < verbose < info < success < warn < error
//
// The LOG_LEVEL env var controls minimum output (default: info).
// All output goes to stderr to keep stdout clean for structured data.
// ---------------------------------------------------------------------------

// -- ANSI codes ---------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightWhite: '\x1b[97m',
} as const;

type AnsiKey = keyof typeof ANSI;

// Minimal writable stream interface for testability.
export interface WriteStream {
  write(chunk: string): boolean | void;
  isTTY?: boolean;
}

function shouldColor(stream: WriteStream): boolean {
  return !process.env.NO_COLOR && !!stream.isTTY;
}

// -- Level definitions --------------------------------------------------------

interface LevelDef {
  priority: number;
  color: AnsiKey;
  badge: string;
}

const LEVELS: Record<string, LevelDef> = {
  debug: { priority: 0, color: 'gray', badge: 'DBG' },
  verbose: { priority: 1, color: 'dim', badge: 'VRB' },
  info: { priority: 2, color: 'cyan', badge: 'INF' },
  success: { priority: 3, color: 'green', badge: ' OK' },
  warn: { priority: 4, color: 'yellow', badge: 'WRN' },
  error: { priority: 5, color: 'red', badge: 'ERR' },
};

const DEFAULT_LEVEL = 'info';

// Shared mutable state: all logger instances read from this.
let currentMinLevel = resolveLevel(process.env.LOG_LEVEL);

function resolveLevel(value: string | undefined): number {
  const key = (value ?? '').toLowerCase();
  if (LEVELS[key]) return LEVELS[key].priority;
  return LEVELS[DEFAULT_LEVEL].priority;
}

// -- Timestamp formatting -----------------------------------------------------

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// -- Logger factory -----------------------------------------------------------

export interface Logger {
  debug(msg: string): void;
  verbose(msg: string): void;
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface LoggerOptions {
  stream?: WriteStream;
}

export interface CreateLogger {
  (scope: string, options?: LoggerOptions): Logger;
  setLevel(level: string): void;
  formatMd(text: string, stream?: WriteStream): string;
  MdStream: typeof MdStream;
}

function createLoggerImpl(scope: string, options?: LoggerOptions): Logger {
  const stream: WriteStream = options?.stream ?? process.stderr;
  const useColor = shouldColor(stream);

  function applyColor(color: AnsiKey, text: string): string {
    if (!useColor) return text;
    return `${ANSI[color]}${text}${ANSI.reset}`;
  }

  function write(level: string, msg: string): void {
    const def = LEVELS[level];
    if (def.priority < currentMinLevel) return;

    const ts = applyColor('gray', timestamp());
    const badge = applyColor(def.color, def.badge);
    const scopeStr = applyColor('magenta', scope);
    const text =
      def.priority >= LEVELS.warn.priority ? applyColor(def.color, msg) : msg;

    stream.write(`${ts} ${badge} ${scopeStr} ${text}\n`);
  }

  return {
    debug: (msg) => write('debug', msg),
    verbose: (msg) => write('verbose', msg),
    info: (msg) => write('info', msg),
    success: (msg) => write('success', msg),
    warn: (msg) => write('warn', msg),
    error: (msg) => write('error', msg),
  };
}

// -- Markdown-to-terminal formatter -------------------------------------------
// Renders a subset of markdown with ANSI codes for terminal display.
//
// Supported:
//   # H1              -> bold underline bright white
//   ## H2             -> bold bright white
//   ### H3            -> dim
//   **bold**          -> bold bright white
//   *italic* / _it_   -> italic
//   `code`            -> cyan
//   ```lang ... ```   -> cyan block with dim fences
//   - bullet          -> bullet character

function formatInline(text: string, useColor: boolean): string {
  if (!useColor) return text;

  let result = text;

  // Code spans: `text` -> cyan
  result = result.replace(/`([^`]+)`/g, (_, code: string) => {
    return `${ANSI.cyan}${code}${ANSI.reset}`;
  });

  // Bold: **text** -> bold + bright white
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, bold: string) => {
    return `${ANSI.bold}${ANSI.brightWhite}${bold}${ANSI.reset}`;
  });

  // Italic: *text* or _text_ -> italic
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, it: string) => {
    return `${ANSI.italic}${it}${ANSI.reset}`;
  });
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, (_, it: string) => {
    return `${ANSI.italic}${it}${ANSI.reset}`;
  });

  return result;
}

function formatLine(
  line: string,
  inCodeBlock: boolean,
  useColor: boolean
): string {
  if (!useColor) return line;

  // Inside a code block: render content in cyan, no inline formatting
  if (inCodeBlock) {
    return `${ANSI.cyan}${line}${ANSI.reset}`;
  }

  // Headings (must be at start of line, after optional whitespace)
  const headingMatch = line.match(/^(\s*)(#{1,3})\s+(.*)/);
  if (headingMatch) {
    const indent = headingMatch[1];
    const level = headingMatch[2].length;
    const content = formatInline(headingMatch[3], useColor);
    if (level === 1) {
      return `${indent}${ANSI.bold}${ANSI.underline}${ANSI.brightWhite}${content}${ANSI.reset}`;
    } else if (level === 2) {
      return `${indent}${ANSI.bold}${ANSI.brightWhite}${content}${ANSI.reset}`;
    }
    return `${indent}${ANSI.dim}${content}${ANSI.reset}`;
  }

  // Bullet lines: replace leading "- " with a bullet character
  const bulletMatch = line.match(/^(\s*)- (.*)/);
  if (bulletMatch) {
    return `${bulletMatch[1]}\u2022 ${formatInline(bulletMatch[2], useColor)}`;
  }

  // Regular lines: just format inline elements
  return formatInline(line, useColor);
}

function formatMd(text: string, stream?: WriteStream): string {
  const target = stream ?? process.stdout;
  const useColor = shouldColor(target);
  if (!useColor) return text;

  const lines = text.split('\n');
  const out: string[] = [];
  let inCode = false;

  for (const line of lines) {
    // Code fence toggle
    if (line.trimStart().startsWith('```')) {
      out.push(`${ANSI.dim}${line}${ANSI.reset}`);
      inCode = !inCode;
      continue;
    }

    out.push(formatLine(line, inCode, useColor));
  }

  return out.join('\n');
}

// Streaming markdown formatter. Buffers partial lines and tracks code block
// state across chunks so that text arriving in arbitrary pieces (e.g., from
// a streaming CLI process) is formatted correctly.
//
// Usage:
//   const md = new MdStream(process.stderr);
//   proc.stdout.on('data', (chunk) => md.write(chunk));
//   proc.on('close', () => md.end());

export class MdStream {
  private stream: WriteStream;
  private useColor: boolean;
  private inCodeBlock: boolean;
  private buffer: string;

  constructor(stream: WriteStream) {
    this.stream = stream;
    this.useColor = shouldColor(stream);
    this.inCodeBlock = false;
    this.buffer = '';
  }

  write(chunk: string): void {
    this.buffer += chunk;

    // Process complete lines, keep any trailing partial line in the buffer
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // last element is partial (or empty if chunk ended with \n)

    for (const line of lines) {
      this._emitLine(line);
    }
  }

  end(): void {
    // Flush remaining buffer
    if (this.buffer) {
      this._emitLine(this.buffer);
      this.buffer = '';
    }
  }

  private _emitLine(line: string): void {
    // Code fence toggle
    if (line.trimStart().startsWith('```')) {
      this.stream.write(
        `${this.useColor ? ANSI.dim : ''}${line}${this.useColor ? ANSI.reset : ''}\n`
      );
      this.inCodeBlock = !this.inCodeBlock;
      return;
    }

    this.stream.write(formatLine(line, this.inCodeBlock, this.useColor) + '\n');
  }
}

// Attach static methods to createLogger so callers can do:
//   createLogger.setLevel('verbose')
//   createLogger.formatMd(text, stream)
//   new createLogger.MdStream(stream)

const createLogger = createLoggerImpl as CreateLogger;

createLogger.setLevel = function (level: string): void {
  currentMinLevel = resolveLevel(level);
};

createLogger.formatMd = formatMd;
createLogger.MdStream = MdStream;

export { createLogger };
