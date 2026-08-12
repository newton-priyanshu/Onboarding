import { useState, useEffect } from 'react';
import { Trophy, Flame, Medal, RefreshCw } from 'lucide-react';
import { t } from '../config/theme';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import { getLevelProgress } from '../config/gamification';

// ─── Types ──────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  full_name: string | null;
  total_xp: number;
  level: number;
  current_streak: number;
  achievements: number;
}

// ─── Component ──────────────────────────────────────────

/**
 * Campus-wide leaderboard. Reads via the SECURITY DEFINER RPC
 * get_campus_leaderboard() — restricted to campus_head / campus_admin /
 * super_admin on the server side.
 */
export default function LeaderboardPanel({ limit = 10 }: { limit?: number }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await supabase.rpc('get_campus_leaderboard', { p_limit: limit }).then(unwrap);
      setRows((data || []) as LeaderboardRow[]);
    } catch (err) {
      // Graceful degradation (BUG-1): when the RPC is missing on the backend
      // (PostgREST PGRST202 — "function not found", typically because the
      // gamification migration hasn't been applied yet), degrade to a subtle
      // empty state instead of surfacing a raw error. This is the code-level
      // half of the fix; the deployment half applies the migration.
      const message = (err as { message?: string; code?: string })?.message || String(err);
      const rpcMissing = (err as { code?: string })?.code === 'PGRST202'
        || /does not exist|PGRST202|function not found/i.test(message);
      if (rpcMissing) {
        console.info('[LeaderboardPanel] get_campus_leaderboard RPC unavailable — hiding section (gamification migration may not be applied).');
        setError('__rpc_missing__');
      } else {
        console.error('Failed to load leaderboard:', err);
        setError('Leaderboard is unavailable right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [limit]);

  const medalColors = ['#D4AF37', '#9E9E9E', '#CD7F32'];

  return (
    <div style={{
      border: '1px solid rgba(26, 26, 26, 0.12)',
      background: 'var(--color-alabaster)',
      animation: 'luxFadeIn 0.6s forwards',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid rgba(26, 26, 26, 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px',
            border: '1px solid var(--color-gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(212, 175, 55, 0.08)',
          }}>
            <Trophy size={18} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
          </div>
          <div>
            <span style={{ fontFamily: t.heading, fontSize: '1.05rem', fontWeight: 400, color: t.ch, display: 'block' }}>
              Campus Leaderboard
            </span>
            <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>
              Top {limit} by XP — celebrate your joinees' momentum
            </span>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh leaderboard"
          style={{
            background: 'none', border: '1px solid rgba(26,26,26,0.2)', cursor: 'pointer',
            color: t.wg, padding: '6px', display: 'flex',
            transition: 'color 200ms, border-color 200ms',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = t.ch; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = t.wg; }}
        >
          <RefreshCw size={13} strokeWidth={1.5} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {/* Body */}
      <div>
        {loading ? (
          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, padding: '2rem 1.5rem' }}>
            Loading leaderboard…
          </p>
        ) : error === '__rpc_missing__' ? (
          <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, padding: '1.5rem 1.5rem', fontStyle: 'italic' }}>
            Leaderboard unavailable — it appears once gamification is fully deployed.
          </p>
        ) : error ? (
          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, padding: '2rem 1.5rem' }}>
            {error}
          </p>
        ) : !rows || rows.length === 0 ? (
          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, padding: '2rem 1.5rem' }}>
            No XP earned yet — leaderboard fills up as joinees complete worksheets.
          </p>
        ) : (
          rows.map((row, idx) => {
            const level = getLevelProgress(row.total_xp);
            const isTop3 = idx < 3;
            return (
              <div
                key={row.user_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '0.9rem 1.5rem',
                  borderBottom: idx < rows.length - 1 ? '1px solid rgba(26,26,26,0.06)' : 'none',
                  background: isTop3 ? 'rgba(212, 175, 55, 0.03)' : 'transparent',
                }}
              >
                {/* Rank */}
                <div style={{
                  width: '32px', height: '32px', flexShrink: 0,
                  border: `1px solid ${isTop3 ? medalColors[idx]! : 'rgba(26,26,26,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: t.heading, fontSize: '0.85rem', color: isTop3 ? medalColors[idx]! : t.wg,
                }}>
                  {isTop3 ? <Medal size={14} strokeWidth={1.5} /> : row.rank}
                </div>

                {/* Name + level */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.full_name || 'Unnamed joinee'}
                  </span>
                  <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                    Level {level.level} · {level.title}
                  </span>
                </div>

                {/* Streak */}
                <span style={{
                  fontFamily: t.body, fontSize: '0.6rem', color: '#E65100',
                  display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                }}>
                  <Flame size={11} strokeWidth={2} /> {row.current_streak}
                </span>

                {/* XP */}
                <span style={{
                  fontFamily: t.heading, fontSize: '0.95rem', color: 'var(--color-gold)',
                  whiteSpace: 'nowrap', minWidth: '64px', textAlign: 'right',
                }}>
                  {row.total_xp.toLocaleString()} XP
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
