import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAutoSave, loadWorksheetData, getOAuthName } from './useAutoSave';

/**
 * useWorksheet — Eliminates ~60 lines of boilerplate per worksheet.
 *
 * Handles:
 *  - Data loading from Supabase with saved-data hydration
 *  - OAuth name prefill for new worksheets
 *  - Auto-save integration
 *  - Form submission with validation
 *  - View-state flags (approved / submitted / needs_revision)
 *
 * @param {Object} opts
 * @param {object}  opts.user         — Supabase auth user object
 * @param {string}  opts.worksheetId  — e.g. 'p1_w1'
 * @param {string}  opts.phase        — e.g. 'phase-1'
 * @param {object}  opts.defaultData  — initial state factory or object
 * @param {Array}   [opts.requiredFields] — [{ key, label }] for validation
 * @param {string}  [opts.redirectPath]   — path to navigate back to on submit/approve
 * @param {string}  [opts.approvedMsg]    — message shown on approved view
 * @param {string}  [opts.submittedMsg]   — message shown on submitted view
 */
export function useWorksheet({
  user,
  worksheetId,
  phase,
  defaultData = {},
  requiredFields = [],
  redirectPath = '/',
  approvedMsg = 'Your worksheet has been reviewed and approved.',
  submittedMsg = 'Your worksheet has been submitted for review.',
}) {
  const [data, setData] = useState(() => ({
    ...defaultData,
    _savedReviewStatus: '',
    _savedReviewComment: '',
    _savedReviewerName: '',
    _savedReviewHistory: [],
    _savedReviewedAt: '',
  }));
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { saveStatus, flushSave } = useAutoSave(user, data, worksheetId, phase);

  // ── Load saved data from Supabase ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadWorksheetData(user.id, worksheetId);
        if (cancelled) return;
        if (saved?.worksheet_data) {
          setData(prev => ({
            ...prev,
            ...saved.worksheet_data,
            _savedReviewStatus: saved.review_status || '',
            _savedReviewComment: saved.review_comment || '',
            _savedReviewerName: saved.reviewer_name || '',
            _savedReviewHistory: saved.review_history || [],
            _savedReviewedAt: saved.reviewed_at || '',
          }));
        } else {
          const name = await getOAuthName();
          if (!cancelled && name) setData(prev => ({ ...prev, employeeName: name }));
        }
      } catch (err) {
        if (!cancelled) console.error(`Load error [${worksheetId}]:`, err);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id, worksheetId]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const updateField = useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const validate = useCallback(() => {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) {
      setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return false;
    }
    return true;
  }, [data, requiredFields]);

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitError('');
    if (!validate()) return;
    setSubmitting(true);
    const submitData = {
      ...data,
      status: 'submitted',
      dateSubmitted: new Date().toLocaleDateString('en-IN'),
    };
    setData(submitData);
    await flushSave(submitData);
    setSubmitting(false);
  }, [data, validate, flushSave]);

  // ── Derived view states ──────────────────────────────────────────────
  const isApproved = loaded && data._savedReviewStatus === 'approved';
  const isBuddyApproved = loaded && data._savedReviewStatus === 'buddy_approved';
  const isSubmitted = (
    data.status === 'submitted'
    && loaded
    && data._savedReviewStatus !== 'needs_revision'
    && data._savedReviewStatus !== 'revision_submitted'
    && data._savedReviewStatus !== 'buddy_approved'
    && data._savedReviewStatus !== 'approved'
  );

  const reviewData = useMemo(() => ({
    _savedReviewStatus: data._savedReviewStatus,
    _savedReviewComment: data._savedReviewComment,
    _savedReviewerName: data._savedReviewerName,
    _savedReviewHistory: data._savedReviewHistory || [],
    _savedReviewedAt: data._savedReviewedAt,
    dateSubmitted: data.dateSubmitted,
  }), [
    data._savedReviewStatus,
    data._savedReviewComment,
    data._savedReviewerName,
    data._savedReviewHistory,
    data._savedReviewedAt,
    data.dateSubmitted,
  ]);

  return {
    data,
    setData,
    loaded,
    submitting,
    submitError,
    saveStatus,
    updateField,
    handleSubmit,
    setSubmitError,
    isApproved,
    isBuddyApproved,
    isSubmitted,
    reviewData,
  };
}
