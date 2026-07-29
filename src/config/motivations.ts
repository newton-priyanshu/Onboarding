/**
 * MOTIVATIONS — Rotating daily motivation messages.
 *
 * Picks one per session, stores in localStorage to avoid repeating
 * the same message too often.
 */

const MOTIVATIONS: string[] = [
  "You're doing great. Keep going!",
  'Only a few worksheets left — you\'ve got this.',
  'Almost finished with this phase.',
  'One more step. You\'re almost there.',
  'Every worksheet completed is progress made.',
  'Small steps lead to big achievements.',
  'You\'re building something important.',
  'Consistency beats perfection — keep showing up.',
  'The hardest part is starting. You\'ve already done that.',
  'Progress, not perfection.',
  'Each worksheet brings you closer to your goal.',
  "You're making it look easy.",
  'Stay focused. Stay curious.',
  'This work matters — and you\'re doing it.',
];

const STORAGE_KEY = 'last_motivation_index';

/**
 * Get a motivation message, rotating through the list.
 * Stores the last-used index in localStorage to avoid repetition.
 */
export function getMotivation(): string {
  try {
    const lastIndex = parseInt(localStorage.getItem(STORAGE_KEY) || '-1', 10);
    const nextIndex = (lastIndex + 1) % MOTIVATIONS.length;
    localStorage.setItem(STORAGE_KEY, String(nextIndex));
    return MOTIVATIONS[nextIndex] || MOTIVATIONS[0]!;
  } catch {
    return MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)] || '';
  }
}
