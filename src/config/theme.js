/**
 * Shared theme tokens — single source of truth.
 * Eliminates `const t = {...}` duplication across 16+ files.
 */
export const t = {
  body: 'var(--font-body)',
  heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)',
  wg: 'var(--color-warm-grey)',
  gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
  // Status colors
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  pending: 'var(--color-pending)',
  warning: 'var(--color-warning)',
  purple: 'var(--color-purple)',
};
