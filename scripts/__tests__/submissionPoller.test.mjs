/**
 * Unit tests for the DB-polling helpers in scripts/lib/submissionPoller.mjs.
 *
 * The helpers poll a Supabase-style client until submissions reach an expected
 * review_status (used by browser-pass.mjs to verify buddy/manager approvals
 * landed in the DB). These tests exercise the polling loop itself with mocked
 * thenable query builders — no real Supabase, no Playwright, no network.
 */
import { describe, it, expect, vi } from 'vitest';
import { waitForSubmissionState, waitForAllSubmissionsState } from '../lib/submissionPoller.mjs';

/**
 * Build a mock Supabase client whose chained query builder resolves each poll
 * with the next entry from `script` (the last entry repeats indefinitely —
 * matching how a stable DB state behaves across polls).
 *
 * The builder mimics supabase-js: .from() returns a thenable object, and every
 * filter/select method returns `this` so the chain `from().select().eq().in()`
 * works exactly as in the real client.
 */
function makeMockClient(script) {
  let calls = 0;
  const callLog = [];
  const builder = {
    select(cols) { callLog.push(['select', cols]); return this; },
    eq(col, val) { callLog.push(['eq', col, val]); return this; },
    in(col, vals) { callLog.push(['in', col, vals]); return this; },
    then(resolve) {
      const idx = Math.min(calls, script.length - 1);
      calls += 1;
      resolve(script[idx]);
      return undefined;
    },
  };
  const client = {
    from(table) {
      callLog.push(['from', table]);
      return builder;
    },
    _callCount: () => calls,
    _calls: callLog,
  };
  return client;
}

const row = (wsId, status) => ({ worksheet_id: wsId, review_status: status });
const response = (rows) => ({ data: rows, error: null });

// Tiny timings so the tests exercise real polling but stay fast.
const FAST_TIMEOUT = 150;
const FAST_INTERVAL = 25;

describe('waitForAllSubmissionsState', () => {
  it('returns ok:true with every worksheet state when all match on the first poll', async () => {
    const client = makeMockClient([
      response([row('gc2', 'approved'), row('p2_w1', 'approved')]),
    ]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p2_w1', 'gc2'], 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({
      ok: true,
      states: { p2_w1: 'approved', gc2: 'approved' },
    });
    expect(client._callCount()).toBe(1); // success without extra polls
    expect(client._calls).toEqual([
      ['from', 'worksheet_submissions'],
      ['select', 'worksheet_id, review_status'],
      ['eq', 'user_id', 'user-1'],
      ['in', 'worksheet_id', ['p2_w1', 'gc2']],
    ]);
  });

  it('keeps polling until every worksheet reaches the expected state', async () => {
    const client = makeMockClient([
      response([row('p2_w1', 'buddy_approved'), row('gc2', 'pending_review')]),
      response([row('p2_w1', 'buddy_approved'), row('gc2', 'buddy_approved')]),
    ]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p2_w1', 'gc2'], 'buddy_approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result.ok).toBe(true);
    expect(result.states).toEqual({ p2_w1: 'buddy_approved', gc2: 'buddy_approved' });
    expect(client._callCount()).toBeGreaterThan(1);
  });

  it('returns ok:false with the last observed states when the state never arrives', async () => {
    const client = makeMockClient([
      response([row('p3_w1', 'pending_review'), row('gc3', 'pending_review')]),
    ]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p3_w1', 'gc3'], 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result.ok).toBe(false);
    expect(result.states).toEqual({ p3_w1: 'pending_review', gc3: 'pending_review' });
    expect(client._callCount()).toBeGreaterThan(1); // polled until the deadline
  });

  it('handles a null payload (no rows) by reporting missing states and timing out', async () => {
    const client = makeMockClient([{ data: null, error: null }]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p3_w1'], 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result.ok).toBe(false);
    expect(result.states).toEqual({});
  });

  it('fails on a partial approval (one worksheet approved, one stuck)', async () => {
    // The exact failure mode the browser pass exists to catch: the manager's
    // bulk approve updated only some worksheets ("Only X of Y were approved").
    const client = makeMockClient([
      response([row('p2_w1', 'approved'), row('gc2', 'buddy_approved')]),
    ]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p2_w1', 'gc2'], 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result.ok).toBe(false);
    expect(result.states).toEqual({ p2_w1: 'approved', gc2: 'buddy_approved' });
    expect(client._callCount()).toBeGreaterThan(1);
  });

  it('treats a worksheet missing from the response as not-yet-expected', async () => {
    const client = makeMockClient([
      response([row('p2_w1', 'approved')]), // gc2 absent on this poll
      response([row('p2_w1', 'approved'), row('gc2', 'approved')]),
    ]);
    const result = await waitForAllSubmissionsState(client, 'user-1', ['p2_w1', 'gc2'], 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result.ok).toBe(true);
    expect(result.states).toEqual({ p2_w1: 'approved', gc2: 'approved' });
  });
});

describe('waitForSubmissionState', () => {
  it('returns ok:true with the state when it already matches on the first poll', async () => {
    const client = makeMockClient([response([row('p1_w1', 'buddy_approved')])]);
    const result = await waitForSubmissionState(client, 'user-1', 'p1_w1', 'buddy_approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({ ok: true, state: 'buddy_approved' });
    expect(client._callCount()).toBe(1);
  });

  it('polls until the single submission transitions to the expected state', async () => {
    const client = makeMockClient([
      response([row('p1_w1', 'pending_review')]),
      response([row('p1_w1', 'buddy_approved')]),
    ]);
    const result = await waitForSubmissionState(client, 'user-1', 'p1_w1', 'buddy_approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({ ok: true, state: 'buddy_approved' });
    expect(client._callCount()).toBeGreaterThan(1);
  });

  it('returns ok:false with the last observed state on timeout', async () => {
    const client = makeMockClient([response([row('p1_w1', 'pending_review')])]);
    const result = await waitForSubmissionState(client, 'user-1', 'p1_w1', 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({ ok: false, state: 'pending_review' });
    expect(client._callCount()).toBeGreaterThan(1);
  });

  it('returns state null when the submission row does not exist', async () => {
    const client = makeMockClient([response([])]);
    const result = await waitForSubmissionState(client, 'user-1', 'gc1', 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({ ok: false, state: null });
  });

  it('swallows a DB error and surfaces it as a timeout, not a throw', async () => {
    // Locked contract (see the NOTE in submissionPoller.mjs): error responses
    // are intentionally treated as "not there yet" — a persistent error must
    // resolve to ok:false, never throw.
    const client = makeMockClient([{ data: null, error: { message: 'RLS denied' } }]);
    const result = await waitForSubmissionState(client, 'user-1', 'p1_w1', 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(result).toEqual({ ok: false, state: null });
    expect(client._callCount()).toBeGreaterThan(1);
  });

  it('queries a single submission with the single-row contract', async () => {
    const client = makeMockClient([response([row('p1_w1', 'approved')])]);
    await waitForSubmissionState(client, 'user-1', 'p1_w1', 'approved', FAST_TIMEOUT, FAST_INTERVAL);
    expect(client._calls).toEqual([
      ['from', 'worksheet_submissions'],
      ['select', 'review_status'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'worksheet_id', 'p1_w1'],
    ]);
  });
});

describe('timeout/poll-interval plumbing', () => {
  it('uses an injectable poll interval instead of a fixed 1s sleep', async () => {
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const client = makeMockClient([
        response([row('p2_w1', 'buddy_approved')]),
        response([row('p2_w1', 'buddy_approved'), row('gc2', 'buddy_approved')]),
      ]);
      const result = await waitForAllSubmissionsState(client, 'user-1', ['p2_w1', 'gc2'], 'buddy_approved', 200, 20);
      expect(result.ok).toBe(true);
      expect(sleepSpy).toHaveBeenCalledWith(expect.any(Function), 20);
    } finally {
      sleepSpy.mockRestore();
    }
  });
});
