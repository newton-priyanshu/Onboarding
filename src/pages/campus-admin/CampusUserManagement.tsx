import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { withCampusIf } from '../../api/supabase';
import { unwrap } from '../../api/db';
import {
  Search, Users, Mail,
  AlertCircle, Check, Loader2, Building,
} from 'lucide-react';
import { triggerNotification } from '../../hooks/useNotifications';
import { t } from '../../config/theme';

interface CampusUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  assigned_lead_id: string | null;
  assigned_buddy_id: string | null;
  created_at: string;
  managerName?: string;
  buddyName?: string;
}

interface BuddyProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function CampusUserManagement() {
  const { profile } = useAuth();
  const campusId = profile?.campus_id;

  const [users, setUsers] = useState<CampusUser[]>([]);
  const [buddyProfiles, setBuddyProfiles] = useState<BuddyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (campusId) loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  async function loadUsers() {
    if (!campusId) return;
    setLoading(true);
    try {
      // Fetch all users in this campus
      const allUsers = await withCampusIf(
        supabase.from('user_profiles')
          .select('id, full_name, email, role, department, assigned_lead_id, assigned_buddy_id, created_at')
          .order('created_at', { ascending: false }),
        campusId
      ).then(unwrap) as CampusUser[];

      // Fetch buddy/manager profiles for name resolution
      const buddies = await withCampusIf(
        supabase.from('user_profiles')
          .select('id, full_name, email, role')
          .not('role', 'in', '("new_joinee","lab_instructor")'),
        campusId
      ).then(unwrap) as BuddyProfile[];

      setBuddyProfiles(buddies);

      // Resolve names
      const enriched = allUsers.map(u => ({
        ...u,
        managerName: buddies.find(b => b.id === u.assigned_lead_id)?.full_name || undefined,
        buddyName: buddies.find(b => b.id === u.assigned_buddy_id)?.full_name || undefined,
      }));
      setUsers(enriched);
    } catch (err) {
      console.error('Failed to load campus users:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignManager(userId: string, managerId: string) {
    setSaving(userId);
    setMessage(null);
    try {
      const { error } = await supabase.from('user_profiles').update({ assigned_lead_id: managerId || null }).eq('id', userId);
      if (error) throw error;
      if (managerId) {
        const managerName = buddyProfiles.find(b => b.id === managerId)?.full_name || 'Manager';
        await triggerNotification({ userId, fromUserId: profile?.id, worksheetId: '', type: 'approved', message: `A manager (${managerName}) has been assigned to you.` });
      }
      setMessage({ type: 'success', text: 'Manager updated!' });
      await loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: (err as { message?: string }).message || 'Failed to update.' });
    } finally {
      setSaving(null);
    }
  }

  async function handleAssignBuddy(userId: string, buddyId: string) {
    setSaving(userId);
    setMessage(null);
    try {
      const { error } = await supabase.from('user_profiles').update({ assigned_buddy_id: buddyId || null }).eq('id', userId);
      if (error) throw error;
      if (buddyId) {
        const buddyName = buddyProfiles.find(b => b.id === buddyId)?.full_name || 'Buddy';
        await triggerNotification({ userId, fromUserId: profile?.id, worksheetId: '', type: 'approved', message: `A buddy (${buddyName}) has been assigned to you.` });
      }
      setMessage({ type: 'success', text: 'Buddy updated!' });
      await loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: (err as { message?: string }).message || 'Failed to update.' });
    } finally {
      setSaving(null);
    }
  }

  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    }
    return true;
  });

  const roleOptions = ['all', 'new_joinee', 'lab_instructor', 'lead_instructor', 'onboarding_lead', 'academic_head', 'progression_head', 'ops_head', 'campus_head', 'campus_admin'];

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      new_joinee: 'New Joiner',
      lab_instructor: 'Lab Instructor',
      lead_instructor: 'Buddy / Mentor',
      onboarding_lead: 'Onboarding Lead',
      academic_head: 'Academic Head',
      progression_head: 'Progression Head',
      ops_head: 'Ops Head',
      campus_head: 'Campus Head',
      campus_admin: 'Campus Admin',
    };
    return labels[role] || role;
  };

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
      <div className="lux-container">
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Building size={16} strokeWidth={1.5} style={{ color: t.ch }} />
            <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.ch, padding: '3px 10px', border: '1px solid ' + t.ch }}>Campus Users</span>
          </div>
          <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>User Management</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>{users.length} user(s) in your campus</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: t.wg, pointerEvents: 'none' }} />
            <input type="text" placeholder="Search by name or email…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch, width: '100%', padding: '10px 12px 10px 36px', border: '1px solid rgba(26,26,26,0.15)', background: 'transparent', outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = t.ch}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'}
            />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.ch, padding: '10px 12px', border: '1px solid rgba(26,26,26,0.15)', background: 'transparent', cursor: 'pointer', outline: 'none' }}>
            {roleOptions.map(r => (
              <option key={r} value={r}>{r === 'all' ? 'All Roles' : roleLabel(r)}</option>
            ))}
          </select>
        </div>

        {/* Message */}
        {message && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: message.type === 'success' ? 'rgba(60, 140, 100, 0.06)' : 'rgba(200, 50, 50, 0.06)',
            border: '1px solid ' + (message.type === 'success' ? t.success : t.error),
            fontFamily: t.body, fontSize: '0.78rem', color: message.type === 'success' ? t.success : t.error,
          }}>
            {message.type === 'success' ? <Check size={14} strokeWidth={1.5} /> : <AlertCircle size={14} strokeWidth={1.5} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* User List */}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader2 size={20} strokeWidth={1.5} className="spin-icon" style={{ color: t.wg }} />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Users size={28} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
            <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No users found matching your filters.</p>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
            {/* Table Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 100px',
              gap: '12px', padding: '12px 0', borderBottom: '1px solid rgba(26, 26, 26, 0.08)',
              fontFamily: t.body, fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
            }}>
              <span>User</span>
              <span>Role</span>
              <span>Manager</span>
              <span>Buddy</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {filteredUsers.map((u, idx) => (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 100px',
                gap: '12px', alignItems: 'center', padding: '14px 0',
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.025}s forwards`,
              }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* User Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', border: '1px solid ' + t.ch, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
                    {u.full_name?.charAt(0) || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.full_name}</p>
                    <p style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Mail size={10} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: '3px' }} />{u.email}</p>
                  </div>
                </div>

                {/* Role */}
                <div>
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '3px 8px', border: '1px solid ' + (u.role === 'new_joinee' ? t.info : u.role === 'lead_instructor' ? t.success : u.role === 'academic_head' ? t.purple : t.ch), color: u.role === 'new_joinee' ? t.info : u.role === 'lead_instructor' ? t.success : u.role === 'academic_head' ? t.purple : t.ch }}>
                    {roleLabel(u.role)}
                  </span>
                </div>

                {/* Manager */}
                <div>
                  <select value={u.assigned_lead_id || ''} onChange={e => handleAssignManager(u.id, e.target.value)}
                    disabled={saving === u.id}
                    style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.ch, width: '100%', padding: '4px', border: 'none', borderBottom: '1px solid rgba(26,26,26,0.15)', background: 'transparent', cursor: 'pointer', outline: 'none' }}>
                    <option value="">—</option>
                    {buddyProfiles.map(b => (
                      <option key={b.id} value={b.id}>{b.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Buddy */}
                <div>
                  <select value={u.assigned_buddy_id || ''} onChange={e => handleAssignBuddy(u.id, e.target.value)}
                    disabled={saving === u.id}
                    style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.ch, width: '100%', padding: '4px', border: 'none', borderBottom: '1px solid rgba(26,26,26,0.15)', background: 'transparent', cursor: 'pointer', outline: 'none' }}>
                    <option value="">—</option>
                    {buddyProfiles.filter(b => b.role === 'lead_instructor' || b.role === 'onboarding_lead').map(b => (
                      <option key={b.id} value={b.id}>{b.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div style={{ textAlign: 'right' }}>
                  {saving === u.id ? (
                    <Loader2 size={14} strokeWidth={1.5} className="spin-icon" style={{ color: t.wg }} />
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button onClick={() => {/* Future: edit user */}}
                        style={{ fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em', padding: '4px 8px', border: '1px solid ' + t.ch, background: 'transparent', color: t.ch, cursor: 'pointer' }}>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
