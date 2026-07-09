import { t } from '../config/theme';
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, type LucideIcon } from 'lucide-react';
import { onToast } from '../utils/errorHandling';

// ─── Types ──────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  entering: boolean;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => number;
  removeToast: (id: number) => void;
  clearToasts: () => void;
}

interface ToastStyleConfig {
  icon: LucideIcon;
  bg: string;
  border: string;
  text: string;
}

interface TimersRef {
  current: Record<number, ReturnType<typeof setTimeout>>;
}

// ─── Context ────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

// ─── Styles ─────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, ToastStyleConfig> = {
  success: { icon: CheckCircle2, bg: '#F9F8F6', border: t.success, text: t.success },
  error: { icon: AlertCircle, bg: '#F9F8F6', border: t.error, text: t.error },
  warning: { icon: AlertTriangle, bg: '#F9F8F6', border: t.warning, text: t.warning },
  info: { icon: Info, bg: '#F9F8F6', border: '#1A1A1A', text: '#1A1A1A' },
};

let toastIdCounter = 0;

// ─── Provider ───────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<TimersRef['current']>({});

  const removeToast = useCallback((id: number) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    setToasts(prev => prev.filter(t => t.id !== id));
    delete timersRef.current[id];
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3500): number => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type, entering: true, exiting: false }]);
    requestAnimationFrame(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, entering: false } : t));
    });
    if (duration > 0) {
      const exitMs = 300;
      timersRef.current[id] = setTimeout(() => {
        // Start exit animation
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        // Remove from DOM after animation completes
        timersRef.current[id] = setTimeout(() => removeToast(id), exitMs);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const clearToasts = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
    setToasts([]);
  }, []);

  useEffect(() => {
    const unsub = onToast((message, type) => showToast(message, type));
    return () => unsub();
  }, [showToast]);

  useEffect(() => {
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast, clearToasts }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: '8px',
        maxWidth: '400px', width: '100%', pointerEvents: 'none',
        fontFamily: 'var(--font-body)',
      }}>
        {toasts.map(toast => {
          const config = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
          const Icon = config.icon;
          return (
            <div key={toast.id} style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '14px 16px',
              background: config.bg,
              borderLeft: `2px solid ${config.border}`,
              opacity: toast.exiting ? 0 : toast.entering ? 0 : 1,
              transform: toast.exiting ? 'translateY(-4px)' : toast.entering ? 'translateY(8px)' : 'translateY(0)',
              transition: 'opacity 300ms var(--ease-lux), transform 300ms var(--ease-lux)',
            }}>
              <Icon size={16} strokeWidth={1.5} style={{ color: config.text, flexShrink: 0, marginTop: '1px' }} />
              <span style={{ flex: 1, fontSize: '0.8rem', color: config.text, lineHeight: 1.5 }}>
                {toast.message}
              </span>
              <button onClick={() => removeToast(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: config.text, opacity: 0.4, flexShrink: 0 }}
                aria-label="Dismiss">
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
