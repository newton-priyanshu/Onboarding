import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { Briefcase, User } from 'lucide-react';
import { triggerNotification } from '../../hooks/useNotifications';
import { t } from '../../config/theme';
import type { UserProfile } from '../../types/supabase';

interface BuddyProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface AssignmentsTabProps {
  instructors: UserProfile[];
  buddyProfiles: BuddyProfile[];
  onRefresh: () => void;
}

export default function AssignmentsTab({ instructors, buddyProfiles, onRefresh }: AssignmentsTabProps) {
  const { profile } = useAuth();
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedBuddy, setSelectedBuddy] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const buddyCandidates = buddyProfiles.filter(i => i.id !== selectedInstructor);
  const assignedInstructors = instructors.filter(i => i.assigned_lead_id || i.assigned_buddy_id);
  const unassignedInstructors = instructors.filter(i => !i.assigned_lead_id && !i.assigned_buddy_id);

  const styleLabel: React.CSSProperties = { fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '8px' };
  const styleSelect: React.CSSProperties = { fontFamily: t.body, fontSize: '0.8rem', color: t.ch, width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid ' + t.ch, background: 'transparent', outline: 'none', marginBottom: '1.5rem' };
  const btnPrimary: React.CSSProperties = { fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', border: '1px solid ' + t.ch, background: t.ch, color: '#F9F8F6', cursor: 'pointer', transition: 'all 200ms ' + t.ease };

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.5rem' }}>
        Assign Manager & Buddy
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <label style={styleLabel} htmlFor="assign-joinee">Joinee</label>
          <select id="assign-joinee" style={styleSelect} value={selectedInstructor} onChange={e => { setSelectedInstructor(e.target.value); setMessage(''); }}>
            <option value="">Select...</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.full_name} {i.assigned_lead_id ? '(managed)' : ''} {i.assigned_buddy_id ? '(buddy)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={styleLabel} htmlFor="assign-manager">Manager</label>
          <select id="assign-manager" style={styleSelect} value={selectedManager} onChange={e => setSelectedManager(e.target.value)}>
            <option value="">Select...</option>
            {buddyCandidates.filter(p => p.role === 'academic_head').map(b => (<option key={b.id} value={b.id}>{b.full_name}</option>))}
          </select>
        </div>
        <div>
          <label style={styleLabel} htmlFor="assign-buddy">Buddy / Mentor</label>
          <select id="assign-buddy" style={styleSelect} value={selectedBuddy} onChange={e => setSelectedBuddy(e.target.value)}>
            <option value="">Select...</option>
            {buddyCandidates.filter(p => p.role === 'lead_instructor' || p.role === 'onboarding_lead').map(b => (
              <option key={b.id} value={b.id}>{b.full_name} · {b.role === 'lead_instructor' ? 'Buddy / Mentor' : 'Onboarding Lead'}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={async () => {
          if (!selectedInstructor || !selectedManager) { setMessage('Select a joinee and a manager.'); return; }
          setSaving(true); setMessage('');
          const { error } = await supabase.from('user_profiles').update({ assigned_lead_id: selectedManager || null }).eq('id', selectedInstructor);
          if (!error) {
            const managerName = buddyProfiles.find(p => p.id === selectedManager)?.full_name || 'Manager';
            const joineeName = instructors.find(p => p.id === selectedInstructor)?.full_name || 'Joinee';
            await triggerNotification({ userId: selectedInstructor, fromUserId: profile?.id, worksheetId: '', type: 'approved', message: `A manager (${managerName}) has been assigned to you.` });
            await triggerNotification({ userId: selectedManager, fromUserId: profile?.id, worksheetId: '', type: 'submitted', message: `You have been assigned as the manager for ${joineeName}.` });
          }
          setMessage(error ? 'Error: ' + error.message : 'Manager assigned!');
          onRefresh(); setSaving(false);
        }} disabled={saving} style={btnPrimary}>
          <Briefcase size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Assign Manager
        </button>
        <button onClick={async () => {
          if (!selectedInstructor || !selectedBuddy) { setMessage('Select a joinee and a buddy.'); return; }
          setSaving(true); setMessage('');
          const { error } = await supabase.from('user_profiles').update({ assigned_buddy_id: selectedBuddy || null }).eq('id', selectedInstructor);
          if (!error) {
            const buddyName = buddyProfiles.find(p => p.id === selectedBuddy)?.full_name || 'Buddy';
            const joineeName = instructors.find(p => p.id === selectedInstructor)?.full_name || 'Joinee';
            await triggerNotification({ userId: selectedInstructor, fromUserId: profile?.id, worksheetId: '', type: 'approved', message: `A buddy/mentor (${buddyName}) has been assigned to you.` });
            await triggerNotification({ userId: selectedBuddy, fromUserId: profile?.id, worksheetId: '', type: 'submitted', message: `You have been assigned as the buddy/mentor for ${joineeName}.` });
          }
          setMessage(error ? 'Error: ' + error.message : 'Buddy assigned!');
          onRefresh(); setSaving(false);
        }} disabled={saving} style={btnPrimary}>
          <User size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Assign Buddy
        </button>
      </div>

      {message && <div style={{ fontFamily: t.body, fontSize: '0.75rem', color: message.includes('Error') ? t.error : t.success, marginBottom: '1rem' }}>{message}</div>}

      <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
        <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
          Current Assignments ({assignedInstructors.length})
        </p>
        {assignedInstructors.length === 0 ? (
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No assignments yet.</p>
        ) : (
          assignedInstructors.map(instr => {
            const manager = buddyProfiles.find(l => l.id === instr.assigned_lead_id);
            const buddy = buddyProfiles.find(b => b.id === instr.assigned_buddy_id);
            return (
              <div key={instr.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 600, color: t.ch, minWidth: '120px' }}>{instr.full_name}</span>
                <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + t.purple, color: t.purple }}>
                  Manager: {manager?.full_name || '—'}
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #0369A1', color: '#0369A1' }}>
                  Buddy: {buddy?.full_name || '—'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
          Unassigned ({unassignedInstructors.length})
        </p>
        {unassignedInstructors.map(instr => (
          <div key={instr.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch }}>{instr.full_name}</span>
            <span style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{instr.email}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
