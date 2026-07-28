import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { Building, Save, AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react';
import { t } from '../../config/theme';

interface CampusInfo {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  is_active: boolean;
  branding: Record<string, unknown>;
}

export default function CampusSettings() {
  const { profile } = useAuth();
  const campusId = profile?.campus_id;

  const [campus, setCampus] = useState<CampusInfo | null>(null);
  const [campusName, setCampusName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (campusId) loadCampusInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  async function loadCampusInfo() {
    if (!campusId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('campuses')
        .select('*')
        .eq('id', campusId)
        .single();
      if (data) {
        const c = data as CampusInfo;
        setCampus(c);
        setCampusName(c.name);
        setWelcomeMessage((c.branding?.welcome_message as string) || '');
      }
    } catch (err) {
      console.error('Failed to load campus info:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!campusId || !campus) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('campuses')
        .update({
          name: campusName,
          branding: { ...campus.branding, welcome_message: welcomeMessage },
        })
        .eq('id', campusId);

      if (error) throw error;
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: (err as { message?: string }).message || 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (!campusId) {
    return (
      <div className="lux-section" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <Building size={32} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
          <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No campus assigned.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '700px' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building size={16} strokeWidth={1.5} style={{ color: t.ch }} />
              <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.ch, padding: '3px 10px', border: '1px solid ' + t.ch }}>Campus Settings</span>
            </div>
            <button onClick={loadCampusInfo} disabled={loading} style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '6px 16px', cursor: 'pointer' }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Refresh
            </button>
          </div>
          <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Campus Settings</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Manage your campus configuration</p>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Loader2 size={20} strokeWidth={1.5} className="spin-icon" style={{ color: t.wg }} />
          </div>
        ) : (
          <>
            {/* Campus Info */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1.5rem' }}>General Information</h3>

              <div className="lux-form-group">
                <label className="lux-label" htmlFor="settings-campus-name">Campus Name</label>
                <input id="settings-campus-name" className="lux-input" value={campusName}
                  onChange={e => setCampusName(e.target.value)}
                  placeholder="Enter campus name" />
              </div>

              <div className="lux-form-group">
                <label className="lux-label">Campus Slug</label>
                <input className="lux-input" value={campus?.slug || ''} disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '4px' }}>
                  The slug is used in URLs and cannot be changed after creation.
                </p>
              </div>

              <div className="lux-form-group">
                <label className="lux-label">Domain</label>
                <input className="lux-input" value={campus?.domain || ''} disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }} />
              </div>

              <div className="lux-form-group">
                <label className="lux-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Status
                  <span style={{
                    fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em',
                    padding: '2px 8px', background: campus?.is_active ? 'rgba(60,140,100,0.1)' : 'rgba(200,50,50,0.1)',
                    color: campus?.is_active ? t.success : t.error,
                    border: '1px solid ' + (campus?.is_active ? t.success : t.error),
                  }}>
                    {campus?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>
            </div>

            {/* Branding */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1.5rem' }}>
                Branding <span style={{ fontSize: '0.7rem', color: t.wg, fontWeight: 400 }}>— coming soon</span>
              </h3>

              <div style={{
                padding: '1.5rem', border: '1px solid rgba(26,26,26,0.1)',
                fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.6,
              }}>
                <p>Future branding options will include:</p>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                  <li>Custom logo upload</li>
                  <li>Theme color customization</li>
                  <li>Welcome message (editable below)</li>
                  <li>Custom email templates</li>
                </ul>
              </div>

              <div className="lux-form-group" style={{ marginTop: '1.5rem' }}>
                <label className="lux-label" htmlFor="settings-welcome">Welcome Message</label>
                <textarea id="settings-welcome" className="lux-input" value={welcomeMessage}
                  onChange={e => setWelcomeMessage(e.target.value)}
                  placeholder="Welcome to our campus! Complete your onboarding journey here."
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: t.body, fontSize: '0.8rem', lineHeight: 1.5 }} />
                <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '4px' }}>
                  Shown to new joiners when they first access the dashboard.
                </p>
              </div>
            </div>

            {/* Message */}
            {message && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem',
                padding: '0.75rem 1rem',
                background: message.type === 'success' ? 'rgba(60, 140, 100, 0.06)' : 'rgba(200, 50, 50, 0.06)',
                border: '1px solid ' + (message.type === 'success' ? t.success : t.error),
                fontFamily: t.body, fontSize: '0.78rem', color: message.type === 'success' ? t.success : t.error,
              }}>
                {message.type === 'success' ? <Check size={14} strokeWidth={1.5} /> : <AlertCircle size={14} strokeWidth={1.5} />}
                <span>{message.text}</span>
              </div>
            )}

            {/* Save Button */}
            <button onClick={handleSave} disabled={saving || loading} className="lux-btn lux-btn-primary" style={{ minWidth: '200px' }}>
              <span className="gold-overlay" /><span className="btn-content">
                {saving ? <><Loader2 size={14} strokeWidth={1.5} className="spin-icon" style={{ marginRight: '6px' }} /> Saving…</> : <><Save size={14} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Save Settings</>}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
