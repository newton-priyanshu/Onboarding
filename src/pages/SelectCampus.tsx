import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { getActiveCampuses } from '../api/tenant';
import { useAuth } from '../context/AuthContext';
import {
  Building, MapPin, Check, Loader2, AlertCircle, GraduationCap,
  BookOpen, TrendingUp, Settings, ArrowLeft, ChevronRight,
} from 'lucide-react';
import type { Campus, Department } from '../types/supabase';
import { t } from '../config/theme';

// ─── Department Config ──────────────────────────────────

interface DeptInfo {
  id: Department;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

const DEPARTMENTS: DeptInfo[] = [
  {
    id: 'academics',
    label: 'Academics',
    description: 'Teaching, curriculum, and faculty development',
    icon: BookOpen,
    color: '#006494',
    bgColor: 'rgba(0, 100, 148, 0.08)',
    borderColor: 'rgba(0, 100, 148, 0.3)',
  },
  {
    id: 'progression',
    label: 'Progression',
    description: 'Student progress tracking, assessments, and outcomes',
    icon: TrendingUp,
    color: '#2E7D32',
    bgColor: 'rgba(46, 125, 50, 0.08)',
    borderColor: 'rgba(46, 125, 50, 0.3)',
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Campus logistics, scheduling, and admin processes',
    icon: Settings,
    color: '#7B1FA2',
    bgColor: 'rgba(123, 31, 162, 0.08)',
    borderColor: 'rgba(123, 31, 162, 0.3)',
  },
];

const DEPT_MAP = new Map(DEPARTMENTS.map(d => [d.id, d]));

// ─── Component ──────────────────────────────────────────

export default function SelectCampus() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Step state: 'department' | 'campus'
  const [step, setStep] = useState<'department' | 'campus'>('department');

  // Selections
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);

  // Data
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch campuses on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const activeCampuses = await getActiveCampuses();
        if (!cancelled) {
          setCampuses(activeCampuses);
          // Auto-select if only one campus
          if (activeCampuses.length === 1 && activeCampuses[0]) {
            setSelectedCampusId(activeCampuses[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Unable to load campuses. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Redirect if user already has campus_id AND department ─────
  useEffect(() => {
    if (profile?.campus_id && profile?.department) {
      navigate('/', { replace: true });
    }
  }, [profile, navigate]);

  // ── Handle department selection ──────────────────────────
  function handleDepartmentSelect(dept: Department) {
    setSelectedDepartment(dept);
    setError(null);
    setStep('campus');
  }

  // ── Handle final submission ────────────────────────────
  async function handleSubmit(campusId: string) {
    // Surface a visible error instead of silently no-oping when the profile
    // hasn't loaded (BUG-4: previously users got stuck on /select-campus with
    // no recoverable UI when profile?.id was missing).
    if (!selectedDepartment) {
      setError('Please select a department first.');
      setStep('department');
      return;
    }
    if (!profile?.id) {
      setError('Your profile is still loading. Please refresh the page and try again.');
      return;
    }
    setSelectedCampusId(campusId);
    setIsSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          campus_id: campusId,
          department: selectedDepartment,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      // Hard-reload to / so AuthContext re-fetches profile
      window.location.href = '/';
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to save selection.';
      setError(msg);
      setIsSaving(false);
      setSelectedCampusId(null);
    }
  }

  // ── Go back to department step ─────────────────────────
  function goBack() {
    setStep('department');
    setError(null);
  }

  // ── Loading State ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <Loader2 size={24} strokeWidth={1.5} className="spin-icon" style={{ color: 'var(--color-warm-grey)', marginBottom: '1rem' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────
  if (error && campuses.length === 0 && step === 'campus') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', textAlign: 'center', maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={28} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, marginBottom: '0.75rem' }}>Couldn&apos;t Load Campuses</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            There was a problem fetching available campuses. Please check your connection and try again.
          </p>
          <button onClick={() => window.location.reload()} className="lux-btn lux-btn-primary" style={{ minWidth: '160px' }}>
            <span className="gold-overlay" /><span className="btn-content">Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────
  if (campuses.length === 0) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', textAlign: 'center', maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <Building size={32} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)', marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, marginBottom: '0.75rem' }}>No Campuses Available</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            There are no campuses configured yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  // STEP 1: SELECT DEPARTMENT
  // ════════════════════════════════════════════════════════
  if (step === 'department') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', maxWidth: '780px' }}>
          <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
            <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
            <div style={{
              width: '56px', height: '56px',
              border: '1px solid var(--color-charcoal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}>
              <GraduationCap size={24} strokeWidth={1.5} style={{ color: 'var(--color-charcoal)' }} />
            </div>
            <h1 style={{
              fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 400,
              letterSpacing: '-0.02em', marginBottom: '0.5rem',
            }}>
              Welcome to AARAMBH
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)', maxWidth: '450px', margin: '0 auto' }}>
              First, tell us your department so we can show you the right onboarding journey.
            </p>
          </div>

          {/* Department Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '12px',
          }}>
            {DEPARTMENTS.map((dept, idx) => {
              const Icon = dept.icon;
              const isSelected = selectedDepartment === dept.id;
              return (
                <button
                  key={dept.id}
                  onClick={() => !isSaving && handleDepartmentSelect(dept.id)}
                  disabled={isSaving}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '16px',
                    padding: '32px 24px',
                    border: isSelected
                      ? `2px solid ${dept.color}`
                      : '1px solid rgba(26, 26, 26, 0.15)',
                    background: isSelected ? dept.bgColor : 'transparent',
                    cursor: isSaving ? 'default' : 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    transition: 'all 250ms var(--ease-lux)',
                    opacity: 0,
                    animation: `luxFadeIn 0.5s ${idx * 0.08}s forwards`,
                    position: 'relative',
                  }}
                  onMouseOver={e => {
                    if (!isSaving && !isSelected) {
                      e.currentTarget.style.borderColor = dept.borderColor;
                      e.currentTarget.style.background = dept.bgColor;
                    }
                  }}
                  onMouseOut={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.15)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{
                    width: '52px', height: '52px',
                    border: `1px solid ${isSelected ? dept.color : 'var(--color-charcoal)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isSelected ? dept.color : 'transparent',
                    transition: 'all 250ms var(--ease-lux)',
                  }}>
                    <Icon size={22} strokeWidth={1.5}
                      style={{ color: isSelected ? '#FFFFFF' : 'var(--color-charcoal)' }}
                    />
                  </div>
                  <div>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '1rem', fontWeight: 500,
                      color: 'var(--color-charcoal)', marginBottom: '4px',
                    }}>
                      {dept.label}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                      color: 'var(--color-warm-grey)', lineHeight: 1.5,
                    }}>
                      {dept.description}
                    </p>
                  </div>
                  <ChevronRight size={16} strokeWidth={1.5}
                    style={{
                      color: isSelected ? dept.color : 'var(--color-warm-grey)',
                      transition: 'transform 200ms var(--ease-lux)',
                      transform: isSelected ? 'translateX(4px)' : 'translateX(0)',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Error message (e.g. department missing — visible on this step too) */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginTop: '1.25rem',
              padding: '0.75rem 1rem',
              background: 'rgba(200, 50, 50, 0.06)',
              border: '1px solid rgba(200, 50, 50, 0.15)',
              fontFamily: 'var(--font-body)', fontSize: '0.78rem',
              color: t.error,
            }}>
              <AlertCircle size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <p style={{
            textAlign: 'center', marginTop: '2rem',
            fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            color: 'var(--color-warm-grey)',
          }}>
            You can change your department later in your profile settings.
          </p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  // STEP 2: SELECT CAMPUS
  // ════════════════════════════════════════════════════════
  const currentDept = selectedDepartment ? DEPT_MAP.get(selectedDepartment) : null;

  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ width: '100%', maxWidth: '720px' }}>
        {/* Back button */}
        <button onClick={goBack} disabled={isSaving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', border: 'none', background: 'transparent',
            cursor: isSaving ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-warm-grey)', marginBottom: '2rem',
          }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Change Department
        </button>

        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.25rem' }} />
          {/* Department badge */}
          {currentDept && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '4px 14px', marginBottom: '1rem',
              background: currentDept.bgColor,
              border: `1px solid ${currentDept.borderColor}`,
              fontFamily: 'var(--font-body)', fontSize: '0.65rem',
              fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: currentDept.color,
            }}>
              <currentDept.icon size={14} strokeWidth={1.5} />
              {currentDept.label}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400,
            letterSpacing: '-0.02em', marginBottom: '0.5rem',
          }}>
            Select Your Campus
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)' }}>
            Choose the college or campus you&apos;re joining.
          </p>
        </div>

        {/* Campus Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {campuses.map((campus, idx) => {
            const isSelected = selectedCampusId === campus.id;
            return (
              <button
                key={campus.id}
                onClick={() => !isSaving && handleSubmit(campus.id)}
                disabled={isSaving}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '20px 24px',
                  border: isSelected
                    ? `2px solid ${currentDept?.color || 'var(--color-charcoal)'}`
                    : '1px solid rgba(26, 26, 26, 0.15)',
                  background: isSelected ? (currentDept?.bgColor || 'rgba(26, 26, 26, 0.03)') : 'transparent',
                  cursor: isSaving ? 'default' : 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  transition: 'all 250ms var(--ease-lux)',
                  opacity: 0,
                  animation: `luxFadeIn 0.5s ${idx * 0.06}s forwards`,
                  position: 'relative',
                }}
                onMouseOver={e => {
                  if (!isSaving && !isSelected) {
                    e.currentTarget.style.borderColor = 'var(--color-charcoal)';
                    e.currentTarget.style.background = 'rgba(26, 26, 26, 0.03)';
                  }
                }}
                onMouseOut={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.15)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{
                  width: '44px', height: '44px',
                  border: `1px solid ${isSelected ? (currentDept?.color || 'var(--color-charcoal)') : 'var(--color-charcoal)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 250ms var(--ease-lux)',
                  background: isSelected ? (currentDept?.color || 'var(--color-charcoal)') : 'transparent',
                }}>
                  {isSelected ? (
                    isSaving ? (
                      <Loader2 size={18} strokeWidth={1.5} className="spin-icon" style={{ color: '#F9F8F6' }} />
                    ) : (
                      <Check size={18} strokeWidth={1.5} style={{ color: '#F9F8F6' }} />
                    )
                  ) : (
                    <Building size={18} strokeWidth={1.5} style={{ color: 'var(--color-charcoal)' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 500,
                    color: 'var(--color-charcoal)', marginBottom: '2px',
                  }}>
                    {campus.name}
                  </p>
                  {campus.domain && (
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                      color: 'var(--color-warm-grey)',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <MapPin size={11} strokeWidth={1.5} />
                      @{campus.domain}
                    </p>
                  )}
                </div>

                {isSelected && !isSaving && (
                  <div style={{
                    position: 'absolute', top: '-1px', right: '-1px',
                    padding: '3px 10px',
                    background: currentDept?.color || 'var(--color-charcoal)',
                    color: '#F9F8F6',
                    fontFamily: 'var(--font-body)', fontSize: '0.5rem',
                    fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase',
                  }}>
                    Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginTop: '1.25rem',
            padding: '0.75rem 1rem',
            background: 'rgba(200, 50, 50, 0.06)',
            border: '1px solid rgba(200, 50, 50, 0.15)',
            fontFamily: 'var(--font-body)', fontSize: '0.78rem',
            color: t.error,
          }}>
            <AlertCircle size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
