import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase';
import { ArrowLeft, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { SkeletonCard } from '../components/Skeleton';
import GateControl1 from './gate-controls/GateControl1';
import GateControl2 from './gate-controls/GateControl2';
import GateControl3 from './gate-controls/GateControl3';
import { WORKSHEET_NAMES } from '../config/worksheetConfig';
import { t } from '../config/theme';
import type { FC } from 'react';

interface GateParams {
  userId: string;
  gateId: string;
  [key: string]: string | undefined;
}

interface JoineeInfo {
  id: string;
  full_name: string;
  email: string;
}

const GATE_COMPONENTS: Record<string, FC<{ targetUserId: string }>> = {
  gc1: GateControl1,
  gc2: GateControl2,
  gc3: GateControl3,
};

export default function BuddyGatePass() {
  const params = useParams<GateParams>();
  const userId = params.userId;
  const gateId = params.gateId;
  const navigate = useNavigate();
  const [joinee, setJoinee] = useState<JoineeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadJoinee = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();
      if (error) throw error;
       
      setJoinee(data as JoineeInfo);
    } catch (err) {
      console.error('Failed to load joinee profile:', err);
       
      setLoadError('We could not load this joinee’s profile. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadJoinee(); }, [loadJoinee]);

  const GateComponent = GATE_COMPONENTS[gateId || ''];
  const wsName = WORKSHEET_NAMES[gateId || ''] || gateId || '';

  if (!gateId || !GATE_COMPONENTS[gateId]) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', color: t.ch }}>Invalid Gate Pass</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, margin: '1rem 0' }}>
            No gate component found for &quot;{gateId}&quot;.
          </p>
          <button onClick={() => navigate('/buddy')} className="lux-btn lux-btn-secondary">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ padding: '2rem' }}><SkeletonCard count={3} /></div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
            Couldn&apos;t Load Gate Pass
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={() => loadJoinee()} className="lux-btn lux-btn-primary">
              <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
            </button>
            <button onClick={() => navigate('/buddy')} className="lux-btn lux-btn-secondary">Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate('/buddy')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Buddy Dashboard
        </button>

        {/* Buddy context banner */}
        <div style={{
          marginBottom: '1.5rem', padding: '12px 16px',
          background: 'rgba(56, 30, 114, 0.04)', border: '1px solid #D0BCFF',
          fontFamily: t.body, fontSize: '0.75rem', color: t.purple,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <Shield size={16} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span>
            You are filling the <strong>{wsName}</strong> gate pass for{' '}
            <strong>{joinee?.full_name || userId}</strong>.
            When submitted, this gate will be marked as buddy-approved and sent to the manager for phase-level approval.
          </span>
        </div>

        {joinee && (
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px', height: '40px', border: '1px solid var(--color-charcoal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: t.body, fontSize: '0.9rem', fontWeight: 500, color: t.ch,
            }}>
              {joinee.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, margin: 0 }}>
                {joinee.full_name}
              </p>
              <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, margin: 0 }}>{joinee.email}</p>
            </div>
          </div>
        )}

        {/* Render the specific GateControl component with targetUserId */}
        {GateComponent && <GateComponent targetUserId={userId || ''} />}
      </div>
    </div>
  );
}
