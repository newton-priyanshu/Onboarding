// =============================================================================
// submissionPoller.mjs — DB-polling helpers for the browser-pass regression.
// =============================================================================
// Extracted from scripts/browser-pass.mjs so the polling logic can be unit
// tested without running the whole Playwright flow. The helpers are pure: the
// Supabase-style client is passed in (any thenable-returning query builder
// works — the mock in the unit test mimics supabase-js's chained builder),
// and the poll interval/timeout are injectable for fast tests.
// =============================================================================

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll the DB until a submission reaches the expected review_status (the
 *  async approve handler's fetch may not have landed when the click resolves). */
// NOTE: both pollers intentionally read only `data` and ignore `error` — a
// transient DB error during the polling window is treated as "not there yet"
// and the loop keeps polling until the timeout. A persistent error therefore
// surfaces as a timeout (ok:false) rather than a crash, which is the desired
// behavior for the browser pass (fail the check loudly, keep going).

export async function waitForSubmissionState(
  client,
  userId,
  worksheetId,
  expected,
  timeoutMs = 15000,
  pollIntervalMs = 1000
) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    const { data } = await client
      .from('worksheet_submissions')
      .select('review_status')
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId);
    lastState = data?.[0]?.review_status ?? null;
    if (lastState === expected) return { ok: true, state: lastState };
    await sleep(pollIntervalMs);
  }
  return { ok: false, state: lastState };
}

/** Poll the DB until EVERY worksheet in the list reaches the expected state
 *  (used to confirm a phase-level approval completed for the whole set). */
export async function waitForAllSubmissionsState(
  client,
  userId,
  worksheetIds,
  expected,
  timeoutMs = 20000,
  pollIntervalMs = 1000
) {
  const deadline = Date.now() + timeoutMs;
  let lastStates = {};
  while (Date.now() < deadline) {
    const { data } = await client
      .from('worksheet_submissions')
      .select('worksheet_id, review_status')
      .eq('user_id', userId)
      .in('worksheet_id', worksheetIds);
    lastStates = {};
    for (const row of data || []) lastStates[row.worksheet_id] = row.review_status;
    if (worksheetIds.every((id) => lastStates[id] === expected)) return { ok: true, states: lastStates };
    await sleep(pollIntervalMs);
  }
  return { ok: false, states: lastStates };
}
