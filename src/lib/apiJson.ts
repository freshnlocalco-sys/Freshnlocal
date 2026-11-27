/**
 * Reading a response from one of this site's own /api functions.
 *
 * WHY THIS EXISTS
 *
 * vercel.json rewrites everything that is not a file to /index.html. The
 * `/api/(.*)` rule sits above that catch-all, but it only takes effect when a
 * function is actually deployed at that path. So a missing, misnamed or
 * undeployed function does NOT answer 404 -- it answers 200 with the SPA's
 * HTML. `res.ok` is true. A caller that checks only `res.ok` reports success
 * having accomplished nothing.
 *
 * This is measured, not hypothetical. Against production today:
 *
 *     200  /api/orders/mirror           -> index.html   (not deployed)
 *     200  /api/admin/mirror-catalogue  -> index.html   (not deployed)
 *     200  /api/emails/send-status-email-> index.html   (not deployed)
 *     500  /api/emails/cancel-order     -> real function, errored on GET
 *
 * Only the last one of those exists. The first three look like successes to
 * `res.ok`. For the order mirror that would mean every checkout logging
 * "mirrored" while no order ever reached the packing floor -- the same kind of
 * silent gap that let web_orders sit frozen at 248 rows while the site took
 * orders every day.
 *
 * So: a response counts only when it is JSON. Anything else is reported with
 * what actually came back, because "the function is not there" and "the server
 * said no" need different fixes and should never look the same in a log.
 */

/**
 * One object with optional fields rather than a discriminated union: this
 * project compiles without strictNullChecks, and without it TypeScript will not
 * narrow a union on an `ok: true | false` discriminant -- `if (!result.ok)`
 * leaves `result.reason` an error. The shape that works here is the shape to
 * use here.
 */
export interface ApiResult<T> {
  ok: boolean;
  /** Set when ok. */
  data?: T;
  /** Set when not ok, and always says what actually came back. */
  reason?: string;
}

export async function readApiJson<T>(res: Response): Promise<ApiResult<T>> {
  const contentType = res.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const body = await res.text().catch(() => '');
    // Naming the cause rather than the symptom: this is the one failure whose
    // remedy is "deploy the function", and it is worth saying so in the log.
    const isAppShell = /<!doctype html/i.test(body) || /<div id="root"/i.test(body);
    return {
      ok: false,
      reason: isAppShell
        ? `${res.status} but the page HTML came back instead of JSON — this /api function is not deployed`
        : `${res.status} non-JSON response (${contentType || 'no content-type'}): ${body.slice(0, 120)}`,
    };
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch (err) {
    return { ok: false, reason: `${res.status} unreadable JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    // The functions all answer errors as { error: "..." }, so that is what a
    // reader wants to see -- not the whole body.
    const stated = (data as { error?: unknown } | null)?.error;
    return { ok: false, reason: `${res.status} ${typeof stated === 'string' ? stated : JSON.stringify(data).slice(0, 200)}` };
  }

  return { ok: true, data };
}
