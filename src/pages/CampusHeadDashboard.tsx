import { useNavigate } from 'react-router-dom';
import { BookOpen, Target, Sparkles, Users, ArrowRight, Shield } from 'lucide-react';
import { t } from '../config/theme';

// ─── Department data ────────────────────────────────────

interface DeptInfo {
  key: string;
  label: string;
  desc: string;
  color: string;
  icon: typeof BookOpen;
  phases: { num: number; label: string }[];
}

const DEPARTMENTS: DeptInfo[] = [
  {
    key: 'academics',
    label: 'Academics',
    desc: 'Teaching, curriculum design, and faculty development',
    color: '#006494',
    icon: BookOpen,
    phases: [
      { num: 1, label: 'Phase 1 — Orientation' },
      { num: 2, label: 'Phase 2 — Contribution' },
      { num: 3, label: 'Phase 3 — Ownership' },
    ],
  },
  {
    key: 'progression',
    label: 'Progression',
    desc: 'Progress tracking, assessment design, and student outcome analysis',
    color: '#2E7D32',
    icon: Target,
    phases: [
      { num: 1, label: 'Phase 1 — Orientation' },
      { num: 2, label: 'Phase 2 — Contribution' },
      { num: 3, label: 'Phase 3 — Ownership' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    desc: 'Campus operations, scheduling, compliance, and resource management',
    color: '#7B1FA2',
    icon: Sparkles,
    phases: [
      { num: 1, label: 'Phase 1 — Orientation' },
      { num: 2, label: 'Phase 2 — Contribution' },
      { num: 3, label: 'Phase 3 — Ownership' },
    ],
  },
];

// ─── Component ──────────────────────────────────────────

export default function CampusHeadDashboard() {
  const navigate = useNavigate();

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Hero */}
        <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.25rem' }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '1rem',
          }}>
            Campus Head · Overview
          </span>
          <h1 style={{
            fontFamily: t.heading,
            fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: t.ch,
            marginBottom: '1rem',
          }}>
            All <em style={{ fontStyle: 'italic', color: t.gd }}>Departments</em>
            <br />
            Overview
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.9rem', lineHeight: 1.7,
            color: t.wg, maxWidth: '500px',
          }}>
            Monitor onboarding progress across all three departments — Academics, Progression, and Operations.
            Click any department to view detailed phase worksheets.
          </p>
        </div>

        {/* Department Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {DEPARTMENTS.map((dept, idx) => {
            const Icon = dept.icon;
            return (
              <div
                key={dept.key}
                style={{
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  padding: '2rem',
                  cursor: 'pointer',
                  transition: 'all 200ms var(--ease-lux)',
                  animation: `luxFadeIn 0.6s ${idx * 0.12}s forwards`,
                  opacity: 0,
                }}
                onClick={() => navigate(`/${dept.key === 'academics' ? '' : dept.key}`)}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') navigate(`/${dept.key === 'academics' ? '' : dept.key}`); }}
                role="button"
                tabIndex={0}
                aria-label={`View ${dept.label} department`}
                onMouseOver={e => { e.currentTarget.style.borderColor = dept.color; e.currentTarget.style.background = `${dept.color}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
                  <div style={{
                    width: '56px', height: '56px',
                    border: `1px solid ${dept.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    background: `${dept.color}10`,
                  }}>
                    <Icon size={26} strokeWidth={1.5} style={{ color: dept.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h2 style={{
                        fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400,
                        color: t.ch, margin: 0,
                      }}>
                        {dept.label}
                      </h2>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        fontSize: '0.6rem', fontWeight: 500,
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: dept.color,
                        border: `1px solid ${dept.color}4D`,
                        background: `${dept.color}15`,
                      }}>
                        {dept.key}
                      </span>
                    </div>
                    <p style={{
                      fontFamily: t.body, fontSize: '0.8rem', color: t.wg,
                      lineHeight: 1.6, marginBottom: '1rem', maxWidth: '500px',
                    }}>
                      {dept.desc}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {dept.phases.map(ph => (
                        <button
                          key={ph.num}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(dept.key === 'academics' ? `/phase-${ph.num}` : `/${dept.key}/phase-${ph.num}`);
                          }}
                          style={{
                            padding: '6px 14px',
                            border: `1px solid ${dept.color}4D`,
                            background: `${dept.color}08`,
                            color: dept.color,
                            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            cursor: 'pointer',
                            transition: 'background 200ms',
                          }}
                          onMouseOver={e => { e.currentTarget.style.background = `${dept.color}20`; }}
                          onMouseOut={e => { e.currentTarget.style.background = `${dept.color}08`; }}
                        >
                          {ph.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={18} strokeWidth={1.5} style={{ color: dept.color, flexShrink: 0, marginTop: '18px' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Links */}
        <div style={{
          marginTop: '4rem',
          borderTop: '1px solid rgba(26, 26, 26, 0.12)',
          paddingTop: '2rem',
        }}>
          <h4 style={{
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
            marginBottom: '1rem',
          }}>
            Quick Actions
          </h4>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/admin')} className="lux-btn lux-btn-secondary">
              <Shield size={14} strokeWidth={1.5} /> Admin Dashboard
            </button>
            <button onClick={() => navigate('/buddy')} className="lux-btn lux-btn-secondary">
              <Users size={14} strokeWidth={1.5} /> Reviews & Approvals
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
