import { Users, UserCircle, Target, Shield, MessageCircle } from 'lucide-react';

const stakeholders = [
  {
    role: 'Onboarding Lead',
    title: 'Program Manager',
    description: 'Oversees the entire onboarding process, maintains the guide, and ensures consistency across all new instructors.',
    icon: Target,
    responsibilities: [
      'Owns and updates the onboarding guide',
      'Monitors progress across all phases',
      'Coordinates between stakeholders',
      'Ensures timely milestone completions',
    ],
  },
  {
    role: 'Manager',
    title: 'Direct Manager',
    description: 'Approves milestones, provides constructive feedback, and conducts classroom observations to evaluate readiness.',
    icon: Shield,
    responsibilities: [
      'Approves phase transitions',
      'Conducts classroom observations',
      'Provides regular feedback sessions',
      'Makes final readiness assessment',
    ],
  },
  {
    role: 'Buddy / Mentor',
    title: 'Peer Guide',
    description: 'Offers daily support, answers questions, shares informal guidance, and helps navigate the organizational culture.',
    icon: MessageCircle,
    responsibilities: [
      'Daily check-ins and support',
      'Informal guidance & Q&A',
      'Shares best practices',
      'Helps navigate campus culture',
    ],
  },
  {
    role: 'New Joinee',
    title: 'Onboarding Participant',
    description: 'Proactively manages their own onboarding journey and completes all assigned tasks and content creation milestones.',
    icon: UserCircle,
    responsibilities: [
      'Completes all phase checklists',
      'Creates required content',
      'Seeks feedback proactively',
      'Documents reflections & progress',
    ],
  },
];

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function Stakeholders() {
  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Onboarding <em style={{ fontStyle: 'italic', color: t.gd }}>Stakeholders</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Everyone involved in making your onboarding successful
              </p>
            </div>
          </div>
        </div>

        {/* Stakeholder cards */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {stakeholders.map((person, idx) => {
            const Icon = person.icon;
            return (
              <div key={person.role} style={{
                borderTop: '1px solid var(--color-charcoal)',
                padding: '2rem 0',
                opacity: 0,
                animation: `luxFadeIn 0.6s ${idx * 0.12}s forwards`,
              }}>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '56px', height: '56px',
                    border: '1px solid var(--color-charcoal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={24} strokeWidth={1.5} style={{ color: t.ch }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <h2 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, margin: 0 }}>
                        {person.role}
                      </h2>
                      <span className="lux-badge lux-badge-light" style={{ fontSize: '0.6rem' }}>
                        {person.title}
                      </span>
                    </div>
                    <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.7, marginBottom: '1.25rem', maxWidth: '650px' }}>
                      {person.description}
                    </p>
                    <div>
                      <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.gd, marginBottom: '0.75rem' }}>
                        Key Responsibilities
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {person.responsibilities.map((resp, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: t.ch, fontFamily: t.body }}>
                            <div style={{ width: '4px', height: '4px', background: t.gd, flexShrink: 0 }} />
                            {resp}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
