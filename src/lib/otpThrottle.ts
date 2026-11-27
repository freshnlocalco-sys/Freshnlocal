/**
 * The sign-in form's own memory of how often this browser has asked for a code.
 *
 * THIS IS NOT THE SECURITY CONTROL. Anyone can clear localStorage, open a
 * private window, or call Supabase directly, and all of that bypasses every
 * line below. The real limit lives in the Send SMS hook (whatsappOtp.ts) backed
 * by web_otp_sends in Postgres, which every delivered message must pass
 * through.
 *
 * What this is for is telling the truth to the customer *before* they hit that
 * wall. Without it the third resend simply fails with a generic error and they
 * have no idea whether to wait ten seconds or ten minutes. With it they get a
 * countdown. The two sets of numbers are meant to match, and the client's being
 * slightly generous is harmless -- the server refuses either way.
 *
 * Every read and write is wrapped: localStorage throws in Safari private mode
 * and is simply absent during SSR, and a sign-in form that explodes because it
 * could not remember a counter would be a far worse bug than the one this
 * prevents.
 */

const KEY_PREFIX = 'fnl_otp_state_v1:';

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Mirrors OTP_MAX_SENDS on the server. */
export const MAX_SENDS = num(import.meta.env.VITE_OTP_MAX_SENDS as string | undefined, 3);
/** Mirrors OTP_WINDOW_MINUTES. */
export const WINDOW_MS = num(import.meta.env.VITE_OTP_WINDOW_MINUTES as string | undefined, 15) * 60_000;
/** Mirrors OTP_BLOCK_MINUTES. */
export const BLOCK_MS = num(import.meta.env.VITE_OTP_BLOCK_MINUTES as string | undefined, 15) * 60_000;
/** Mirrors the Phone OTP Expiry setting in the Supabase dashboard. */
export const EXPIRY_MS = num(import.meta.env.VITE_OTP_EXPIRY_SECONDS as string | undefined, 600) * 1000;
/** Wrong codes allowed before the form makes them request a fresh one. */
export const MAX_VERIFY_ATTEMPTS = num(import.meta.env.VITE_OTP_MAX_VERIFY_ATTEMPTS as string | undefined, 5);
/** The ordinary wait between resends, well inside the allowance. */
export const RESEND_COOLDOWN_MS = num(import.meta.env.VITE_OTP_RESEND_COOLDOWN_SECONDS as string | undefined, 30) * 1000;

interface OtpState {
  sends: number;
  windowStart: number;
  blockedUntil: number | null;
  attempts: number;
  lastSentAt: number | null;
}

const fresh = (): OtpState => ({
  sends: 0,
  windowStart: Date.now(),
  blockedUntil: null,
  attempts: 0,
  lastSentAt: null,
});

const keyFor = (phone: string) => KEY_PREFIX + String(phone || '').replace(/\D/g, '').slice(-10);

function read(phone: string): OtpState {
  try {
    const raw = localStorage.getItem(keyFor(phone));
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<OtpState>;
    return { ...fresh(), ...parsed };
  } catch {
    return fresh();
  }
}

function write(phone: string, state: OtpState): void {
  try {
    localStorage.setItem(keyFor(phone), JSON.stringify(state));
  } catch {
    // Private mode, or storage full. The server still enforces the real limit.
  }
}

export function clearOtpState(phone: string): void {
  try {
    localStorage.removeItem(keyFor(phone));
  } catch {
    /* nothing to do */
  }
}

export interface SendVerdict {
  allowed: boolean;
  /** Milliseconds until the next send is permitted. 0 when allowed now. */
  waitMs: number;
  /** Requests left in this window, after this one would be counted. */
  remaining: number;
  /** True when the allowance is spent, as opposed to the short cooldown. */
  lockedOut: boolean;
}

/**
 * May this browser ask for a code right now?
 *
 * Reads only — it does not spend anything, so it is safe to call on every
 * render to drive a countdown.
 */
export function canSend(phone: string): SendVerdict {
  const s = read(phone);
  const now = Date.now();

  if (s.blockedUntil && s.blockedUntil > now) {
    return { allowed: false, waitMs: s.blockedUntil - now, remaining: 0, lockedOut: true };
  }

  // A lapsed window (or a lockout that has run out) is a clean slate.
  const windowOver = now - s.windowStart >= WINDOW_MS;
  const sends = s.blockedUntil || windowOver ? 0 : s.sends;

  if (sends >= MAX_SENDS) {
    return { allowed: false, waitMs: BLOCK_MS, remaining: 0, lockedOut: true };
  }

  // The ordinary between-resends cooldown.
  if (s.lastSentAt && now - s.lastSentAt < RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      waitMs: RESEND_COOLDOWN_MS - (now - s.lastSentAt),
      remaining: MAX_SENDS - sends,
      lockedOut: false,
    };
  }

  return { allowed: true, waitMs: 0, remaining: MAX_SENDS - sends - 1, lockedOut: false };
}

/** Record that a code was requested. Call only after the request succeeded. */
export function recordSend(phone: string): SendVerdict {
  const s = read(phone);
  const now = Date.now();
  const windowOver = now - s.windowStart >= WINDOW_MS;

  const next: OtpState = {
    sends: (s.blockedUntil || windowOver ? 0 : s.sends) + 1,
    windowStart: s.blockedUntil || windowOver ? now : s.windowStart,
    blockedUntil: null,
    attempts: 0,          // a new code gets a fresh set of tries
    lastSentAt: now,
  };

  if (next.sends >= MAX_SENDS) next.blockedUntil = now + BLOCK_MS;

  write(phone, next);
  return {
    allowed: false,                       // never immediately again
    waitMs: next.blockedUntil ? BLOCK_MS : RESEND_COOLDOWN_MS,
    remaining: Math.max(0, MAX_SENDS - next.sends),
    lockedOut: !!next.blockedUntil,
  };
}

/**
 * Record a wrong code.
 *
 * Returns true when the customer has used up their tries and must request a
 * new code. Supabase independently refuses a code after its own limit; this
 * stops the form sitting there inviting a sixth guess.
 */
export function recordFailedAttempt(phone: string): boolean {
  const s = read(phone);
  const attempts = s.attempts + 1;
  write(phone, { ...s, attempts });
  return attempts >= MAX_VERIFY_ATTEMPTS;
}

/** Tries left before the current code is abandoned. */
export function attemptsLeft(phone: string): number {
  return Math.max(0, MAX_VERIFY_ATTEMPTS - read(phone).attempts);
}

/** When the code last sent to this number stops being valid. */
export function codeExpiresAt(phone: string): number | null {
  const s = read(phone);
  return s.lastSentAt ? s.lastSentAt + EXPIRY_MS : null;
}

/** "9:58" — for a countdown the customer reads at a glance. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
