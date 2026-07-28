import { useState, useMemo } from 'react';
import { Search, Users, Mail, Shield, Briefcase, BadgeAlert, AlertCircle, UserCheck } from 'lucide-react';
import { t } from '../../config/theme';
import type { UserProfile } from '../../types/supabase';

interface BuddyProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface RosterTabProps {
  instructors: UserProfile[];
  buddyProfiles: BuddyProfile[];
  campusId?: string | null;
}

export default function RosterTab({ instructors, buddyProfiles, campusId }: RosterTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const roster = useMemo(() => {
    let list = instructors.map(instr => {
      const manager = buddyProfiles.find(b => b.id === instr.assigned_lead_id);
      const buddy = buddyProfiles.find(b => b.id === instr.assigned_buddy_id);
      return {
        ...instr,
        managerName: manager?.full_name || null,
        buddyName: buddy?.full_name || null,
        buddyRole: buddy?.role || null,
      };
    });

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.full_name?.toLowerCase().includes(q) ||
        i.email?.toLowerCase().includes(q) ||
        i.buddyName?.toLowerCase().includes(q) ||
        i.managerName?.toLowerCase().includes(q)
      );
    }

    // Filter by assignment status
    if (filterBy === 'assigned') {
      list = list.filter(i => i.assigned_buddy_id || i.assigned_lead_id);
    } else if (filterBy === 'unassigned') {
      list = list.filter(i => !i.assigned_buddy_id && !i.assigned_lead_id);
    }

    return list;
  }, [instructors, buddyProfiles, searchQuery, filterBy]);

  const totalAssigned = instructors.filter(i => i.assigned_buddy_id || i.assigned_lead_id).length;
  const totalUnassigned = instructors.filter(i => !i.assigned_buddy_id && !i.assigned_lead_id).length;
  const totalWithBuddy = instructors.filter(i => i.assigned_buddy_id).length;
  const totalWithManager = instructors.filter(i => i.assigned_lead_id).length;

  const countBadgeStyle: React.CSSProperties = {
    fontFamily: t.body,
    fontSize: '0.55rem',
    fontWeight: 500,
    letterSpacing: '0.1em',
    padding: '3px 10px',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 250ms var(--ease-lux)',
  };

  return (
    <div>
      {/* Summary stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1px',
        background: 'rgba(26, 26, 26, 0.1)',
        marginBottom: '2rem',
      }}>
        <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
          <Users size={20} strokeWidth={1.5} style={{ color: t.ch, marginBottom: '8px' }} />
          <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '4px' }}>{instructors.length}</p>
          <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Total Joinees</p>
        </div>
        <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
          <Shield size={20} strokeWidth={1.5} style={{ color: t.info, marginBottom: '8px' }} />
          <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.info, marginBottom: '4px' }}>{totalWithBuddy}</p>
          <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>With Buddy</p>
        </div>
        <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
          <Briefcase size={20} strokeWidth={1.5} style={{ color: t.purple, marginBottom: '8px' }} />
          <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.purple, marginBottom: '4px' }}>{totalWithManager}</p>
          <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>With Manager</p>
        </div>
        <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
          <BadgeAlert size={20} strokeWidth={1.5} style={{ color: totalUnassigned > 0 ? t.warning : t.success, marginBottom: '8px' }} />
          <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: totalUnassigned > 0 ? t.warning : t.success, marginBottom: '4px' }}>{totalUnassigned}</p>
          <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Unassigned</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} strokeWidth={1.5} style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            color: t.wg, pointerEvents: 'none',
          }} />
          <input
            type="text"
            placeholder="Search by name, email, buddy, or manager…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              fontFamily: t.body, fontSize: '0.8rem', color: t.ch,
              width: '100%', padding: '10px 12px 10px 36px',
              border: '1px solid rgba(26,26,26,0.15)',
              background: 'transparent', outline: 'none',
              transition: 'border-color 200ms var(--ease-lux)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = t.ch; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
          />
        </div>
        {(['all', 'assigned', 'unassigned'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterBy(f)}
            style={{
              ...countBadgeStyle,
              border: `1px solid ${filterBy === f ? t.ch : 'rgba(26,26,26,0.2)'}`,
              color: filterBy === f ? '#F9F8F6' : t.wg,
              background: filterBy === f ? t.ch : 'transparent',
            }}
          >
            {f === 'all' ? 'All' : f === 'assigned' ? `Assigned (${totalAssigned})` : `Unassigned (${totalUnassigned})`}
          </button>
        ))}
      </div>

      {/* Roster list */}
      {roster.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div className="lux-line" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>No Joinees Found</p>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>
            {campusId && 'This campus has '}
            {searchQuery
              ? 'No joinees match your search. Try adjusting the query or clearing the filters.'
              : filterBy === 'unassigned'
                ? 'All joinees have been assigned a buddy or manager. Great work!'
                : 'No joinees found.'}
          </p>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 120px',
            gap: '12px',
            padding: '12px 0',
            borderBottom: '1px solid rgba(26, 26, 26, 0.08)',
            fontFamily: t.body,
            fontSize: '0.55rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: t.wg,
          }}>
            <span>Joinee</span>
            <span>Buddy / Mentor</span>
            <span>Manager</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>

          {/* Rows */}
          {roster.map((instr, idx) => (
            <div
              key={instr.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 120px',
                gap: '12px',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                opacity: 0,
                animation: `luxFadeIn 0.4s ${idx * 0.035}s forwards`,
                transition: 'background 200ms var(--ease-lux)',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Joinee */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px', height: '34px',
                  border: '1px solid ' + t.ch,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch,
                }}>
                  {instr.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {instr.full_name}
                  </p>
                  <p style={{
                    fontFamily: t.body, fontSize: '0.6rem', color: t.wg,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <Mail size={10} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                    {instr.email}
                  </p>
                </div>
              </div>

              {/* Buddy */}
              <div>
                {instr.buddyName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserCheck size={14} strokeWidth={1.5} style={{ color: t.info, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{instr.buddyName}</p>
                      <p style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg, letterSpacing: '0.05em' }}>
                        {instr.buddyRole === 'lead_instructor' ? 'Buddy / Mentor' : instr.buddyRole === 'onboarding_lead' ? 'Onboarding Lead' : instr.buddyRole || ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <span style={{
                    fontFamily: t.body, fontSize: '0.65rem', color: t.warning,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <AlertCircle size={12} strokeWidth={1.5} />
                    No buddy assigned
                  </span>
                )}
              </div>

              {/* Manager */}
              <div>
                {instr.managerName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={14} strokeWidth={1.5} style={{ color: t.purple, flexShrink: 0 }} />
                    <p style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{instr.managerName}</p>
                  </div>
                ) : (
                  <span style={{
                    fontFamily: t.body, fontSize: '0.65rem', color: t.warning,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <AlertCircle size={12} strokeWidth={1.5} />
                    No manager assigned
                  </span>
                )}
              </div>

              {/* Status badge */}
              <div style={{ textAlign: 'right' }}>
                {!instr.assigned_buddy_id && !instr.assigned_lead_id ? (
                  <span style={{
                    fontFamily: t.body, fontSize: '0.5rem', fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '4px 10px',
                    background: 'rgba(200, 150, 50, 0.1)',
                    color: t.warning,
                    border: '1px solid ' + t.warning,
                  }}>
                    Unassigned
                  </span>
                ) : instr.assigned_buddy_id && instr.assigned_lead_id ? (
                  <span style={{
                    fontFamily: t.body, fontSize: '0.5rem', fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '4px 10px',
                    background: 'rgba(60, 140, 100, 0.08)',
                    color: t.success,
                    border: '1px solid ' + t.success,
                  }}>
                    Fully Assigned
                  </span>
                ) : (
                  <span style={{
                    fontFamily: t.body, fontSize: '0.5rem', fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '4px 10px',
                    background: 'rgba(200, 150, 50, 0.08)',
                    color: t.warning,
                    border: '1px solid ' + t.warning,
                  }}>
                    Partial
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '1.5rem',
        padding: '12px 0',
        fontFamily: t.body,
        fontSize: '0.65rem',
        color: t.wg,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <span>Showing {roster.length} of {instructors.length} joinees</span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', background: t.success, display: 'inline-block' }} />
            Fully assigned
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', background: t.warning, display: 'inline-block' }} />
            Partial / Unassigned
          </span>
        </div>
      </div>
    </div>
  );
}
