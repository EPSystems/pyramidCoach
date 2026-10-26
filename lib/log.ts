/**
 * Tiny scoped logger, safe in server, client and proxy code (no `server-only`, no Node APIs).
 *
 *   const log = createLogger('actions/training');
 *   log.debug('logSet', { sessionId, setIndex });
 *   const { error } = log.db('upsert logged_sets', await supabase.from('logged_sets').upsert(row));
 *
 * Context is a flat object of ids, counts and codes. Never pass secrets, tokens, cookies, passwords,
 * emails or whole user payloads. Error values (any `err`/`error` key, or any Error instance) are reduced
 * to name/message/code/status/digest, so Postgrest `details` (which can echo row values) never get logged.
 *
 * `debug` prints outside production, or anywhere when NEXT_PUBLIC_DEBUG=1. It stays quiet under
 * vitest (NODE_ENV=test) unless NEXT_PUBLIC_DEBUG=1, so engine guard logs don't flood test output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

const DEBUG_ON =
  process.env.NEXT_PUBLIC_DEBUG === '1' || (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test');

const ERROR_KEYS = ['name', 'message', 'code', 'status', 'digest'] as const;

/** Safe summary of a thrown value or a Supabase/Postgrest/Auth error. */
export function errInfo(e: unknown): LogContext | undefined {
  if (e == null) return undefined;
  if (typeof e !== 'object') return { message: String(e) };
  const o = e as Record<string, unknown>;
  const out: LogContext = {};
  for (const k of ERROR_KEYS) if (o[k] != null && o[k] !== '') out[k] = o[k];
  return out;
}

function normalise(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    out[k] = v instanceof Error || k === 'err' || k === 'error' ? errInfo(v) : v;
  }
  return out;
}

function emit(level: LogLevel, scope: string, msg: string, ctx?: LogContext) {
  if (level === 'debug' && !DEBUG_ON) return;
  const line = `[${scope}] ${msg}`;
  const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
  if (ctx && Object.keys(ctx).length) fn(line, normalise(ctx));
  else fn(line);
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  /** Pass-through for a Supabase result: logs `<op> failed` at error level when `res.error` is set, returns `res` unchanged. */
  db<T extends { error: unknown }>(op: string, res: T, ctx?: LogContext): T;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, ctx) => emit('debug', scope, msg, ctx),
    info: (msg, ctx) => emit('info', scope, msg, ctx),
    warn: (msg, ctx) => emit('warn', scope, msg, ctx),
    error: (msg, ctx) => emit('error', scope, msg, ctx),
    db(op, res, ctx) {
      if (res.error) emit('error', scope, `${op} failed`, { ...ctx, err: res.error });
      return res;
    },
  };
}
