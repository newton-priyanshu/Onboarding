import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { getReviewerType } from '../worksheetConfig.jsx';
import { notifyError } from '../utils/errorHandling';

export function useAutoSave(user, worksheetData, worksheetId, phase = 'phase-1') {
  const [saveStatus, setSaveStatus] = useState('idle');
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const save = useCallback(async (data) => {
    if (!user?.id) return;
    setSaveStatus('saving');
    const reviewerType = getReviewerType(worksheetId);
    try {
      const { error } = await supabase.from('worksheet_submissions').upsert({
        user_id: user.id,
        worksheet_id: worksheetId,
        worksheet_data: data,
        phase,
        reviewer_type: reviewerType,
        status: data.status || 'In Progress',
        review_status: data.status === 'submitted'
          ? (data._savedReviewStatus === 'needs_revision' ? 'revision_submitted' : 'pending_review')
          : '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,worksheet_id' });
      if (error) throw error;
      if (mountedRef.current) {
        setSaveStatus('saved');
        setTimeout(() => {
          if (mountedRef.current) setSaveStatus((p) => p === 'saved' ? 'idle' : p);
        }, 2000);
      }
    } catch (err) {
      notifyError('Auto-save failed:', err);
      if (mountedRef.current) setSaveStatus('error');
    }
  }, [user?.id, worksheetId, phase]);

  useEffect(() => {
    if (!user?.id) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(worksheetData), 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [worksheetData, save, user?.id]);

  const flushSave = useCallback(async (data) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await save(data);
  }, [save]);

  return { saveStatus, flushSave };
}
// ...

      export async function loadWorksheetData(userId, worksheetId) {
      if (!userId || !worksheetId) return null;
      const { data } = await supabase
      .from('worksheet_submissions')
      .select('*')
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId)
      .maybeSingle();
      return data;
      }

      export async function getOAuthName() {
      try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.user_metadata?.full_name || 
           user?.user_metadata?.name || 
           user?.email?.split('@')[0] || '';
      } catch {
      return '';
      }
      }

