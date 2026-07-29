import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, FileText, BookOpen, Target, Sparkles, Users, Shield } from 'lucide-react';
import { t } from '../config/theme';
import { WORKSHEET_NAMES } from '../config/worksheetConfigData';

// ─── Types ──────────────────────────────────────────────

interface SearchResult {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: typeof FileText;
  category: 'worksheet' | 'page' | 'department';
}

// ─── Static search data ─────────────────────────────────

const PAGES: { label: string; path: string; icon: typeof FileText; description: string }[] = [
  { label: 'Dashboard', path: '/', icon: FileText, description: 'Your onboarding progress' },
  { label: 'Phase 1', path: '/phase-1', icon: BookOpen, description: 'Orientation & Understanding' },
  { label: 'Phase 2', path: '/phase-2', icon: Target, description: 'Contribution & Guided Teaching' },
  { label: 'Phase 3', path: '/phase-3', icon: Sparkles, description: 'Independent Teaching' },
  { label: 'Buddy Reviews', path: '/buddy', icon: Users, description: 'Review worksheets' },
  { label: 'Admin', path: '/admin', icon: Shield, description: 'Admin dashboard' },
  { label: 'Super Admin', path: '/super-admin', icon: Shield, description: 'Platform management' },
  { label: 'Campus Management', path: '/super-admin/campuses', icon: Shield, description: 'Manage campuses' },
  { label: 'Templates', path: '/super-admin/templates', icon: FileText, description: 'Onboarding templates' },
];

// ─── Component ──────────────────────────────────────────

export default function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  // Toggle on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Build search results
  const results: SearchResult[] = [
    // Filter out gate controls — they don't have individual worksheets routes
    ...Object.entries(WORKSHEET_NAMES)
      .filter(([id]) => !id.includes('gc'))
      .map(([id, name]) => ({
      id,
      label: name,
      description: `Worksheet — ${id.replace(/_/g, ' ').toUpperCase()}`,
      path: id.startsWith('pr_')
        ? `/progression/phase-${id.includes('gc') ? id.replace('pr_gc', '') : id.match(/_p(\d)_/)?.[1] || '1'}/worksheet/${id}`
        : id.startsWith('op_')
          ? `/operations/phase-${id.includes('gc') ? id.replace('op_gc', '') : id.match(/_p(\d)_/)?.[1] || '1'}/worksheet/${id}`
          : id.startsWith('p')
            ? `/phase-${id[1]}/worksheet-${id.replace(`p${id[1]}_w`, '')}`
            : id.startsWith('w')
              ? `/week-${id[1]}/worksheet/${id}`
              : `/phase-1/worksheet-${id}`,
      icon: FileText,
      category: 'worksheet' as const,
    })),
    ...PAGES.map(p => ({
      id: p.path,
      label: p.label,
      description: p.description,
      path: p.path,
      icon: p.icon,
      category: 'page' as const,
    })),
  ];

  // Filter
  const filtered = query.trim() === ''
    ? results.slice(0, 10)
    : results.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.id.toLowerCase().includes(query.toLowerCase()) ||
        r.description.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 15);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    navigate(result.path);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', justifyContent: 'center', paddingTop: '12vh',
        background: 'rgba(26, 26, 26, 0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        style={{
          width: '560px', maxWidth: '90vw', maxHeight: '60vh',
          background: 'var(--color-alabaster)',
          display: 'flex', flexDirection: 'column',
          animation: 'luxFadeInUp 0.2s var(--ease-lux) forwards',
        }}
        role="dialog"
        aria-label="Search worksheets and pages"
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
        }}>
          <Search size={18} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search worksheets, pages, departments..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontFamily: t.body, fontSize: '0.9rem',
              color: t.ch, background: 'transparent',
            }}
            aria-label="Search"
          />
          <kbd style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            padding: '3px 6px', border: '1px solid rgba(26,26,26,0.2)',
            color: t.wg, borderRadius: '2px',
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '2rem 20px', textAlign: 'center' }}>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                No results found for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            filtered.map((result, idx) => {
              const Icon = result.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(26, 26, 26, 0.04)' : 'transparent',
                    transition: 'background 100ms',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px',
                    border: '1px solid rgba(26,26,26,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    background: result.category === 'page' ? 'rgba(212, 168, 83, 0.08)' : 'transparent',
                  }}>
                    <Icon size={14} strokeWidth={1.5} style={{ color: result.category === 'page' ? '#D4A853' : t.ch }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500,
                      color: t.ch, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {result.label}
                    </p>
                    <p style={{
                      fontFamily: t.body, fontSize: '0.6rem',
                      color: t.wg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {result.description}
                    </p>
                  </div>
                  <span style={{
                    fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '2px 6px',
                    background: result.category === 'page' ? 'rgba(212, 168, 83, 0.1)' : 'rgba(26,26,26,0.05)',
                    color: result.category === 'page' ? '#D4A853' : t.wg,
                    flexShrink: 0,
                  }}>
                    {result.category}
                  </span>
                  <ArrowRight size={14} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0, opacity: isSelected ? 1 : 0.4 }} />
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid rgba(26, 26, 26, 0.06)',
          display: 'flex', gap: '16px',
        }}>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
            <kbd style={{ padding: '1px 4px', border: '1px solid rgba(26,26,26,0.15)', marginRight: '4px' }}>↑↓</kbd> Navigate
          </span>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
            <kbd style={{ padding: '1px 4px', border: '1px solid rgba(26,26,26,0.15)', marginRight: '4px' }}>↵</kbd> Open
          </span>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
            <kbd style={{ padding: '1px 4px', border: '1px solid rgba(26,26,26,0.15)', marginRight: '4px' }}>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
