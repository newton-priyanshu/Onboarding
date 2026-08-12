/**
 * Unit tests for getWorksheetStatus in src/utils/worksheetStatus.ts.
 *
 * The browser-pass roadmap-row assertions key on these exact labels — e.g. a
 * needs_revision submission must render "Needs Revision" on the joinee
 * dashboard row (STEP 6 rejection round-trip). Extracted from Dashboard.tsx
 * so the mapping is testable in isolation, mirroring the submissionPoller
 * test pattern: a small fixture helper (like the poller's `row()`) and exact
 * assertions against pure logic — no React rendering, no network.
 */
import { describe, it, expect } from 'vitest';
import { AlertCircle, CheckCircle2, Clock, FileText } from 'lucide-react';
import { getWorksheetStatus, type WorksheetStatusRow } from '../worksheetStatus';

/** Minimal row fixture — the mapper only reads review_status/status. */
const sub = (review_status: string, status = ''): WorksheetStatusRow => ({ review_status, status });

describe('getWorksheetStatus — dashboard roadmap row label mapping', () => {
  // The label the browser-pass roadmap-row assertion keys on
  // (locator('a[href*="phase-1/worksheet-1"]').filter({ hasText: 'Needs Revision' })).
  it('maps needs_revision → needs_revision / "Needs Revision"', () => {
    const s = getWorksheetStatus(sub('needs_revision'));
    expect(s).toEqual({
      status: 'needs_revision',
      label: 'Needs Revision',
      color: expect.any(String),
      icon: AlertCircle,
    });
  });

  it('maps approved → approved / "Reviewed"', () => {
    const s = getWorksheetStatus(sub('approved'));
    expect(s.status).toBe('approved');
    expect(s.label).toBe('Reviewed');
    expect(s.icon).toBe(CheckCircle2);
  });

  it('maps buddy_approved → buddy_approved / "Buddy Approved"', () => {
    const s = getWorksheetStatus(sub('buddy_approved'));
    expect(s.status).toBe('buddy_approved');
    expect(s.label).toBe('Buddy Approved');
    expect(s.icon).toBe(CheckCircle2);
  });

  it('maps revision_submitted → pending / "Under Review"', () => {
    const s = getWorksheetStatus(sub('revision_submitted'));
    expect(s.status).toBe('pending');
    expect(s.label).toBe('Under Review');
    expect(s.icon).toBe(Clock);
  });

  it('maps pending_review → pending / "Under Review"', () => {
    const s = getWorksheetStatus(sub('pending_review'));
    expect(s.status).toBe('pending');
    expect(s.label).toBe('Under Review');
    expect(s.icon).toBe(Clock);
  });

  it('maps a submitted row (review_status empty) → submitted / "Submitted"', () => {
    const s = getWorksheetStatus(sub('', 'submitted'));
    expect(s.status).toBe('submitted');
    expect(s.label).toBe('Submitted');
    expect(s.icon).toBe(Clock);
  });

  it('accepts the legacy capital-S "Submitted" status', () => {
    // Legacy rows pre-dating the lowercase-submitted fix must still render.
    const s = getWorksheetStatus(sub('', 'Submitted'));
    expect(s.label).toBe('Submitted');
  });

  it('maps a missing row → not_started / "Not Started" with no icon', () => {
    expect(getWorksheetStatus(null)).toEqual({
      status: 'not_started',
      label: 'Not Started',
      color: expect.any(String),
      icon: null,
    });
    expect(getWorksheetStatus(undefined)?.label).toBe('Not Started');
  });

  it('falls back to in_progress / "In Progress" for anything else', () => {
    const s = getWorksheetStatus(sub('', 'In Progress'));
    expect(s.status).toBe('in_progress');
    expect(s.label).toBe('In Progress');
    expect(s.icon).toBe(FileText);
  });

  it('falls back to in_progress for an unknown status value too', () => {
    // Guard: the final else must catch unknown/empty statuses, never throw.
    expect(getWorksheetStatus(sub('', '')).label).toBe('In Progress');
    // Locks pre-existing behavior: a row with the real 'Not Started' status
    // falls through to 'In Progress' — intentional, preserved from Dashboard.
    expect(getWorksheetStatus(sub('', 'Not Started')).label).toBe('In Progress');
  });
});
