/**
 * Customer sign-in by phone number and a WhatsApp code.
 *
 * Two steps: the number, then the code. There is no sign-up variant, because
 * there is nothing to sign up with -- entering a number that has no account
 * creates one (src/lib/otpAuth.ts explains the trigger that does it), so the
 * same two fields serve both. That is the main reason to prefer this over
 * passwords quite apart from security: it deletes a whole form, a password
 * strength rule, and the reset flow behind it.
 *
 * The limits shown here (three codes, then a lockout; five wrong guesses; a
 * ten-minute expiry) are the FORM's copy of rules enforced elsewhere -- in the
 * Send SMS hook against Postgres, and by Supabase itself. See
 * src/lib/otpThrottle.ts for why both exist. Nothing here is load-bearing for
 * security; it is load-bearing for the customer understanding what happened.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowLeft, AlertCircle, Phone, Clock, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { requestOtp, verifyOtp, formatIndianMobile, toE164, OtpError, NoAccountError } from '../lib/otpAuth';
import { notifySignInSuccess } from '../lib/authNotifications';
import {
  canSend, recordSend, recordFailedAttempt, attemptsLeft, codeExpiresAt,
  clearOtpState, formatDuration, MAX_SENDS, MAX_VERIFY_ATTEMPTS,
} from '../lib/otpThrottle';

interface Props {
  onSuccess: () => void;
  onStaffMode: () => void;
}

export function PhoneOtpForm({ onSuccess, onStaffMode }: Props) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Re-rendered once a second while a countdown is on screen. Nothing reads the
  // value; it exists to make the clock tick.
  const [, setTick] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  // Set synchronously the moment a verification starts. `loading` is state, so
  // it only changes on the next render -- and the code now submits itself on
  // the sixth digit, so a customer who also taps the button straight away would
  // otherwise send two verifications for one code and spend two of their five
  // attempts on it.
  const verifying = useRef(false);

  const verdict = canSend(phone);
  const expiresAt = codeExpiresAt(phone);
  const expired = step === 'code' && expiresAt !== null && Date.now() >= expiresAt;
  const triesLeft = attemptsLeft(phone);

  // One interval for every countdown on screen: the resend cooldown, the
  // lockout and the code's own expiry. Stops as soon as none of them is live,
  // so an idle modal is not re-rendering forever.
  const needsClock = (!verdict.allowed && verdict.waitMs > 0) || (step === 'code' && !expired);
  useEffect(() => {
    if (!needsClock) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [needsClock]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const send = useCallback(async (isResend: boolean) => {
    setError(null);
    setNotice(null);

    const check = canSend(phone);
    if (!check.allowed) {
      setError(
        check.lockedOut
          ? `Too many code requests. Please try again in ${formatDuration(check.waitMs)}.`
          : `Please wait ${formatDuration(check.waitMs)} before asking for another code.`
      );
      return;
    }

    setLoading(true);
    try {
      await requestOtp(phone);
      const after = recordSend(phone);
      setStep('code');
      setCode('');
      if (isResend) setNotice('A new code is on its way.');
      if (after.remaining === 0) {
        setNotice('That was your last code for now. Check WhatsApp carefully.');
      } else if (after.remaining === 1) {
        setNotice('One more code can be sent if this one does not arrive.');
      }
    } catch (err) {
      setError(err instanceof OtpError ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const submitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toE164(phone)) {
      setError('Enter a 10-digit Indian mobile number.');
      return;
    }
    await send(false);
  };

  /**
   * Check one code. Takes the value rather than reading `code` from state,
   * because the auto-submit below fires from the keystroke that completes the
   * sixth digit -- before React has re-rendered with it.
   */
  const verifyCode = async (value: string) => {
    if (verifying.current) return;
    setError(null);
    setNotice(null);

    if (expired) {
      setError('That code has expired. Tap resend to get a new one.');
      return;
    }

    verifying.current = true;
    setLoading(true);
    try {
      await verifyOtp(phone, value);
      clearOtpState(phone);          // a clean slate for the next sign-in
      notifySignInSuccess('there', '');
      onSuccess();
      // No setLoading(false): the modal closes, and clearing it first makes the
      // button flicker back to its idle label on the way out.
    } catch (err) {
      if (err instanceof NoAccountError) {
        // The code was RIGHT, so this must not count as a wrong guess. And the
        // code is spent (single use), so there is nothing to retry on this
        // screen: back to the number, where the "Sign in with email" link for
        // staff lives, with the reason on show.
        setCode('');
        setLoading(false);
        verifying.current = false;
        setStep('phone');
        setError(err.message);
        return;
      }

      const exhausted = recordFailedAttempt(phone);
      setCode('');
      setLoading(false);
      verifying.current = false;
      // Back to the box, so the next attempt can simply be typed.
      requestAnimationFrame(() => codeRef.current?.focus());
      if (exhausted) {
        setError('Too many incorrect codes. Please request a new one.');
      } else {
        const left = attemptsLeft(phone);
        const base = err instanceof OtpError ? err.message : 'That code is not right.';
        setError(left <= 2 ? `${base} ${left} ${left === 1 ? 'try' : 'tries'} left.` : base);
      }
    }
  };

  // The button still works exactly as before; it is the fallback for anyone
  // who edits a digit, and for when auto-submit was skipped below.
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    void verifyCode(code);
  };

  const banner = (tone: 'error' | 'info', icon: React.ReactNode, text: string) => (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        'mb-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs leading-snug ' +
        (tone === 'error'
          ? 'bg-red-50 border-red-200/80 text-red-700'
          : 'bg-amber-50 border-amber-200/80 text-amber-800')
      }
    >
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="font-medium">{text}</span>
    </motion.div>
  );

  const errorBox = error && banner('error', <AlertCircle className="w-4 h-4 text-red-600" />, error);
  const noticeBox = !error && notice && banner('info', <Clock className="w-4 h-4 text-amber-600" />, notice);

  // ---- step 1: the number ---------------------------------------------------
  if (step === 'phone') {
    const lockedOut = !verdict.allowed && verdict.lockedOut;

    return (
      <>
        <div className="mb-5 pr-6">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Sign In</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Enter your mobile number and we'll send a code on WhatsApp. No password needed.
          </p>
        </div>

        {errorBox}
        {noticeBox}
        {!error && lockedOut &&
          banner(
            'info',
            <ShieldAlert className="w-4 h-4 text-amber-600" />,
            `Too many code requests for this number. You can try again in ${formatDuration(verdict.waitMs)}.`
          )}

        <form onSubmit={submitPhone} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-foreground/85 mb-1.5" htmlFor="otp-phone">
              Mobile Number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 flex items-center gap-1.5 text-sm text-muted-foreground pointer-events-none">
                <Phone className="w-4 h-4" />
                <span className="font-medium text-foreground/70">+91</span>
              </span>
              <input
                id="otp-phone"
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={e => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setError(null);
                }}
                placeholder="98765 43210"
                className="w-full h-11 px-3.5 pl-20 bg-secondary/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:bg-white transition-colors tracking-wide"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 ml-0.5">
              The number you use on WhatsApp.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || phone.length !== 10 || lockedOut}
            className="w-full h-11 mt-1 bg-primary hover:bg-[#009e45] active:scale-[0.99] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending Code...</span>
              </>
            ) : lockedOut ? (
              <span>Try again in {formatDuration(verdict.waitMs)}</span>
            ) : (
              <>
                <MessageCircle className="w-4 h-4" />
                <span>Send Code on WhatsApp</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground mt-4.5">
          Staff member?
          <button
            type="button"
            onClick={onStaffMode}
            className="text-primary font-bold hover:underline cursor-pointer ml-1.5"
          >
            Sign in with email
          </button>
        </div>
      </>
    );
  }

  // ---- step 2: the code -----------------------------------------------------
  const outOfTries = triesLeft === 0;
  const canResendNow = verdict.allowed;

  return (
    <>
      <div className="mb-5 pr-6">
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
              setNotice(null);
            }}
            className="p-1 -ml-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            title="Change number"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Enter Code</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          We sent a code on WhatsApp to{' '}
          <b className="font-semibold text-foreground/80">{formatIndianMobile(phone)}</b>.
        </p>
      </div>

      {errorBox}
      {noticeBox}
      {!error && !notice && expired &&
        banner('info', <Clock className="w-4 h-4 text-amber-600" />, 'This code has expired. Request a new one to continue.')}

      <form onSubmit={submitCode} className="space-y-3.5">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-foreground/85" htmlFor="otp-code">
              6-Digit Code
            </label>
            {!expired && expiresAt && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Expires in {formatDuration(expiresAt - Date.now())}
              </span>
            )}
          </div>
          <input
            id="otp-code"
            ref={codeRef}
            required
            type="text"
            inputMode="numeric"
            // Lets the browser and iOS fill this straight from the notification.
            autoComplete="one-time-code"
            value={code}
            onChange={e => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(next);
              if (error) setError(null);
              // Submit on the sixth digit -- typed, pasted, or filled in from the
              // WhatsApp notification by `autocomplete="one-time-code"`. Only on
              // the step INTO six digits, so editing a digit inside a complete
              // code waits for the button rather than firing on every change.
              if (
                next.length === 6 && code.length !== 6 &&
                !verifying.current && !expired && !outOfTries
              ) {
                void verifyCode(next);
              }
            }}
            disabled={expired || outOfTries}
            placeholder="••••••"
            className="w-full h-12 px-3.5 bg-secondary/40 border border-border rounded-xl text-center text-xl font-bold tracking-[0.5em] text-foreground placeholder:text-muted-foreground/40 placeholder:tracking-[0.3em] outline-none focus:border-primary focus:bg-white transition-colors disabled:opacity-50"
          />
          {!expired && !outOfTries && triesLeft < MAX_VERIFY_ATTEMPTS && (
            <p className="text-[11px] text-muted-foreground mt-1 ml-0.5">
              {triesLeft} {triesLeft === 1 ? 'try' : 'tries'} left on this code.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || code.length < 6 || expired || outOfTries}
          className="w-full h-11 mt-1 bg-primary hover:bg-[#009e45] active:scale-[0.99] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <span>Verify &amp; Sign In</span>
          )}
        </button>

        <div className="text-center text-xs text-muted-foreground pt-1">
          {canResendNow ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => send(true)}
              className="text-primary font-bold hover:underline cursor-pointer disabled:opacity-50"
            >
              Resend code
            </button>
          ) : verdict.lockedOut ? (
            <span>
              No codes left for now. Try again in{' '}
              <b className="font-semibold text-foreground/70 tabular-nums">{formatDuration(verdict.waitMs)}</b>.
            </span>
          ) : (
            <span>
              Didn't get it? Resend in{' '}
              <b className="font-semibold text-foreground/70 tabular-nums">{formatDuration(verdict.waitMs)}</b>
              {verdict.remaining > 0 && (
                <span className="text-muted-foreground/70">
                  {' '}· {verdict.remaining} of {MAX_SENDS} left
                </span>
              )}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
