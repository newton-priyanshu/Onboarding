import { t } from '../config/theme';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, UserCheck, Shield, ClipboardCheck, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import type { UserRole } from '../types/supabase';

// ─── Types ──────────────────────────────────────────────

interface NavLink {
  path: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface RoleLabels {
  [key: string]: string;
}

interface NavbarProps {
  progress?: number;
}

// ─── Constants ──────────────────────────────────────────

const roleLabels: RoleLabels = {
  new_joinee: 'New Joinee',
  lab_instructor: 'Lab Instructor',
  lead_instructor: 'Buddy / Mentor',
  academic_head: 'Academic Head',
  onboarding_lead: 'Onboarding Lead',
  acad_ops: 'Acad Ops',
};

// ─── Component ──────────────────────────────────────────

export default function Navbar({ progress }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const { user, profile, signOut } = useAuth();

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  const role = profile?.role as UserRole | undefined;

  // Role-specific links
  const roleLinks: NavLink[] = [];
  if (role === 'lead_instructor' || role === 'academic_head') roleLinks.push({ path: '/buddy', label: 'Reviews', icon: UserCheck });
  if (role === 'onboarding_lead') roleLinks.push({ path: '/onboarding-lead', label: 'Monitoring', icon: Shield });
  if (role === 'academic_head' || role === 'onboarding_lead') roleLinks.push({ path: '/admin', label: 'Admin', icon: ClipboardCheck });

  const baseLinks: NavLink[] = [
    { path: '/', label: 'Dashboard' },
    { path: '/stakeholders', label: 'Stakeholders' },
  ];

  const joineeLinks: NavLink[] = (role === 'new_joinee' || role === 'lab_instructor') ? [
    { path: '/phase-1', label: 'Phase 1' },
    // Phase 2 and 3 are gated — the phase pages themselves handle the lock check.
    { path: '/phase-2', label: 'Phase 2' },
    { path: '/phase-3', label: 'Phase 3' },
  ] : [];

  const allLinks: NavLink[] = [...roleLinks, ...baseLinks, ...joineeLinks];

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); } catch (e) { console.error(e); }
    setSigningOut(false);
    setConfirmingSignOut(false);
  };

  const handleCancelSignOut = () => {
    setConfirmingSignOut(false);
  };

  const isActive = (path: string): boolean => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <header style={{
      background: 'rgba(249, 248, 246, 0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      fontFamily: 'var(--font-body)',
    }}>
      <div className="lux-container" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{
              width: '36px', height: '36px',
              background: 'var(--color-charcoal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F9F8F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.125rem',
              fontWeight: 400,
              color: 'var(--color-charcoal)',
              letterSpacing: '-0.01em',
            }}>
              Newton Onboarding
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Notification Bell - rendered once, visible on all screen sizes */}
            <NotificationBell />
            {/* Desktop nav */}
            <nav className="desktop-nav-lux" style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              {allLinks.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    color: active ? 'var(--color-charcoal)' : 'var(--color-warm-grey)',
                    borderBottom: active ? '1px solid var(--color-charcoal)' : '1px solid transparent',
                    transition: 'color 200ms var(--ease-lux), border-color 200ms var(--ease-lux)',
                  }}
                    onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-gold)'; }}
                    onMouseOut={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-warm-grey)'; }}
                  >
                    {Icon && <Icon size={14} strokeWidth={1.5} />}
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User menu */}
            {user ? (
              <div ref={userMenuRef} style={{ position: 'relative', marginLeft: '8px' }}>
                <button onClick={() => { setUserMenuOpen(!userMenuOpen); setConfirmingSignOut(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 12px',
                    border: '1px solid rgba(26, 26, 26, 0.2)',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem', fontWeight: 500,
                    color: 'var(--color-charcoal)',
                    transition: 'border-color 200ms var(--ease-lux)',
                  }}>
                  <div style={{
                    width: '28px', height: '28px',
                    background: 'var(--color-charcoal)',
                    color: 'var(--color-alabaster)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                  }}>
                    {profile?.full_name?.charAt(0) || 'U'}
                  </div>
                  <span className="desktop-nav-lux" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                    {profile?.full_name?.split(' ')[0] || 'User'}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                    width: '260px',
                    background: 'var(--color-alabaster)',
                    border: '1px solid rgba(26, 26, 26, 0.2)',
                    zIndex: 200,
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                  }}>
                    <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(26, 26, 26, 0.12)' }}>
                      <p style={{ fontWeight: 500, color: 'var(--color-charcoal)', fontSize: '0.85rem' }}>{profile?.full_name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-warm-grey)', marginTop: '4px' }}>{profile?.email}</p>
                      {profile?.role && (
                        <span className="lux-badge" style={{ marginTop: '8px', fontSize: '0.6rem' }}>
                          {roleLabels[profile.role] || profile.role}
                        </span>
                      )}
                    </div>
                    {(role === 'lead_instructor' || role === 'academic_head') && (
                      <button onClick={() => { navigate('/buddy'); setUserMenuOpen(false); }}
                        className="menu-item-btn">
                        <UserCheck size={14} strokeWidth={1.5} /> Reviews
                      </button>
                    )}
                    {role === 'onboarding_lead' && (
                      <button onClick={() => { navigate('/onboarding-lead'); setUserMenuOpen(false); }}
                        className="menu-item-btn">
                        <Shield size={14} strokeWidth={1.5} /> Onboarding Panel
                      </button>
                    )}
                    {(role === 'academic_head' || role === 'onboarding_lead') && (
                      <button onClick={() => { navigate('/admin'); setUserMenuOpen(false); }}
                        className="menu-item-btn">
                        <ClipboardCheck size={14} strokeWidth={1.5} /> Admin Dashboard
                      </button>
                    )}
                    {confirmingSignOut ? (
                      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(26, 26, 26, 0.12)' }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)', marginBottom: '10px', lineHeight: 1.4 }}>
                          Are you sure you want to sign out? You'll need to log back in to continue.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={handleCancelSignOut} disabled={signingOut}
                            style={{
                              flex: 1, padding: '8px 0', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                              cursor: signingOut ? 'default' : 'pointer', color: 'var(--color-charcoal)',
                              fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500,
                              letterSpacing: '0.15em', textTransform: 'uppercase',
                            }}>
                            Cancel
                          </button>
                          <button onClick={handleSignOut} disabled={signingOut}
                            style={{
                              flex: 1, padding: '8px 0', border: '1px solid ' + t.error, background: t.error,
                              cursor: signingOut ? 'default' : 'pointer', color: '#FFFFFF',
                              fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500,
                              letterSpacing: '0.15em', textTransform: 'uppercase',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            }}>
                            {signingOut ? <Loader2 size={12} strokeWidth={1.5} className="spin-icon" /> : <LogOut size={12} strokeWidth={1.5} />}
                            {signingOut ? 'Signing out…' : 'Sign Out'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingSignOut(true)} disabled={signingOut}
                        className="menu-item-btn menu-item-signout">
                        <LogOut size={14} strokeWidth={1.5} />
                        Sign Out
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="lux-btn lux-btn-sm" style={{
                textDecoration: 'none',
                background: 'var(--color-charcoal)',
                color: '#FFFFFF',
                fontSize: '0.65rem',
                padding: '8px 20px',
                height: '36px',
              }}>
                Sign In
              </Link>
            )}

            {/* Mobile toggle */}
            <button onClick={() => { setMobileOpen(!mobileOpen); setConfirmingSignOut(false); }} className="mobile-menu-btn-lux"
              style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal)' }}
              aria-label="Toggle navigation menu">
              {mobileOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Progress bar - only for instructors */}
        {(role === 'lab_instructor' || role === 'new_joinee') && (progress ?? 0) > 0 && (
          <div style={{ padding: '0 0 12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="lux-progress" style={{ flex: 1 }}>
                <div className="lux-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                fontWeight: 500,
                letterSpacing: '0.1em',
                color: 'var(--color-warm-grey)',
                whiteSpace: 'nowrap',
              }}>
                {Math.round(progress ?? 0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{
          borderTop: '1px solid rgba(26, 26, 26, 0.12)',
          background: 'var(--color-alabaster)',
          padding: '8px 0',
          fontFamily: 'var(--font-body)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
        }}>
          {/* Notification bell is rendered once in the header above and visible on all screen sizes */}
          {allLinks.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 24px', textDecoration: 'none',
                  fontSize: '0.8rem',
                  fontWeight: active ? 500 : 400,
                  letterSpacing: '0.05em',
                  color: active ? 'var(--color-charcoal)' : 'var(--color-warm-grey)',
                  background: active ? 'rgba(26, 26, 26, 0.04)' : 'transparent',
                }}>
                {Icon && <Icon size={16} strokeWidth={1.5} />}
                {item.label}
                <ChevronRight size={14} strokeWidth={1.5} style={{ marginLeft: 'auto', color: 'var(--color-warm-grey)' }} />
              </Link>
            );
          })}
          {user && (
            confirmingSignOut ? (
              <div style={{
                borderTop: '1px solid rgba(26, 26, 26, 0.06)',
                padding: '16px 24px',
              }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', marginBottom: '12px' }}>
                  Are you sure you want to sign out?
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setConfirmingSignOut(false); }} disabled={signingOut}
                    style={{
                      flex: 1, padding: '10px 0', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                      cursor: signingOut ? 'default' : 'pointer', color: 'var(--color-charcoal)',
                      fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                    }}>
                    Cancel
                  </button>
                  <button onClick={() => { void handleSignOut(); setMobileOpen(false); }} disabled={signingOut}
                    style={{
                      flex: 1, padding: '10px 0', border: '1px solid ' + t.error, background: t.error,
                      cursor: signingOut ? 'default' : 'pointer', color: '#FFFFFF',
                      fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}>
                    {signingOut ? <Loader2 size={12} strokeWidth={1.5} className="spin-icon" /> : <LogOut size={12} strokeWidth={1.5} />}
                    {signingOut ? 'Signing out…' : 'Sign Out'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmingSignOut(true)} disabled={signingOut}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 24px', border: 'none', borderTop: '1px solid rgba(26, 26, 26, 0.06)', background: 'transparent',
                  cursor: 'pointer', color: 'var(--color-warm-grey)',
                  fontSize: '0.8rem', fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                }}>
                <LogOut size={16} strokeWidth={1.5} /> Sign Out
              </button>
            )
          )}
        </div>
      )}

      <style>{`
        @media (min-width: 850px) { .desktop-nav-lux { display: flex !important; } .mobile-menu-btn-lux { display: none !important; } }
        @media (max-width: 849px) { .desktop-nav-lux { display: none !important; } .mobile-menu-btn-lux { display: flex !important; } }

        @keyframes menuFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin-icon { animation: spin 0.8s linear infinite; }

        .menu-item-btn {
          width: 100%;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--color-charcoal);
          font-size: 0.8rem;
          font-family: var(--font-body);
          transition: background 200ms var(--ease-lux), color 200ms var(--ease-lux);
        }
        .menu-item-btn:hover { background: rgba(26, 26, 26, 0.04); }
        .menu-item-btn:active { background: rgba(26, 26, 26, 0.08); }
        .menu-item-btn:disabled { cursor: default; opacity: 0.6; }
        .menu-item-signout {
          border-top: 1px solid rgba(26, 26, 26, 0.12);
          color: var(--color-warm-grey);
        }
        .menu-item-signout:hover { color: var(--color-error); background: rgba(198, 40, 40, 0.06); }
      `}</style>
    </header>
  );
}
