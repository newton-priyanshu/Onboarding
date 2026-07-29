/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

// ─── CSS Custom Properties for Dark Mode ────────────────

const DARK_VARS: Record<string, string> = {
  '--color-charcoal': '#E8E6E1',
  '--color-warm-grey': '#9E9E9E',
  '--color-alabaster': '#1E1E1E',
  '--color-bg': '#141414',
  '--color-gold': '#C59B3E',
};

const LIGHT_VARS: Record<string, string> = {
  '--color-charcoal': '#1A1A1A',
  '--color-warm-grey': '#8D8D8D',
  '--color-alabaster': '#F9F8F6',
  '--color-bg': '#F9F8F6',
  '--color-gold': '#D4A853',
};

function applyTheme(theme: Theme) {
  const vars = theme === 'dark' ? DARK_VARS : LIGHT_VARS;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// ─── Context ────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Check localStorage first, then system preference
    try {
      const stored = localStorage.getItem('theme') as Theme | null;
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
        applyTheme(stored);
        return;
      }
    } catch { /* localStorage unavailable */ }

    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = prefersDark ? 'dark' : 'light';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem('theme', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    toggleTheme,
    isDark: theme === 'dark',
  }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
