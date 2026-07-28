import { useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import { validateTemplateStructure } from '../../../api/templates';

// ─── Types ──────────────────────────────────────────────

interface WorksheetField {
  id: string;
  title: string;
  reviewer: string;
  engineTag: string;
  isGate: boolean;
}

interface WeekField {
  num: number;
  title: string;
  subtitle: string;
  days: string;
  theme: string;
  worksheets: WorksheetField[];
}

interface PhaseField {
  num: number;
  title: string;
  days: string;
  worksheets: string[]; // worksheet IDs
}

interface GateArtifactField {
  label: string;
  required: boolean;
}

interface GateField {
  gateId: string;
  artifacts: GateArtifactField[];
}

interface TemplateBuilderProps {
  jsonInput: string;
  onJsonChange: (json: string) => void;
}

// ─── Default values ─────────────────────────────────────

const EMPTY_WEEK: () => WeekField = () => ({
  num: 1, title: '', subtitle: '', days: 'Week 1', theme: '', worksheets: [],
});

const EMPTY_WORKSHEET: () => WorksheetField = () => ({
  id: '', title: '', reviewer: 'buddy', engineTag: 'K', isGate: false,
});

const EMPTY_PHASE: () => PhaseField = () => ({
  num: 1, title: '', days: 'Days 1–30', worksheets: [],
});

const EMPTY_GATE: () => GateField = () => ({
  gateId: '', artifacts: [],
});

const EMPTY_ARTIFACT: () => GateArtifactField = () => ({
  label: '', required: true,
});

// ─── Reviewer options ───────────────────────────────────

const REVIEWER_OPTIONS = [
  { value: 'buddy', label: 'Buddy / Mentor' },
  { value: 'manager', label: 'Manager' },
  { value: 'onboarding_lead', label: 'Onboarding Lead' },
];

const ENGINE_TAG_OPTIONS = [
  { value: 'K', label: 'Knowledge Gap' },
  { value: 'B', label: 'Behaviour Gap' },
];

// ─── Component ──────────────────────────────────────────

export default function TemplateBuilder({ jsonInput, onJsonChange }: TemplateBuilderProps) {
  const [weeks, setWeeks] = useState<WeekField[]>([]);
  const [phases, setPhases] = useState<PhaseField[]>([]);
  const [gates, setGates] = useState<GateField[]>([]);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([0]));
  const [useAdvanced, setUseAdvanced] = useState(false); // Start with visual builder

  // ── Parse JSON into form fields ────────────────────────
  const parseJsonToFields = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      const weeksArr = Array.isArray(parsed.weeks) ? parsed.weeks : [];
      const w: WeekField[] = weeksArr.map((wk: Record<string, unknown>) => ({
        num: typeof wk.num === 'number' ? wk.num : 1,
        title: (wk.title as string) || '',
        subtitle: (wk.subtitle as string) || '',
        days: (wk.days as string) || `Week ${wk.num}`,
        theme: (wk.theme as string) || '',
        worksheets: (Array.isArray(wk.worksheets) ? wk.worksheets : []).map((ws: Record<string, unknown>) => ({
          id: (ws.id as string) || '',
          title: (ws.title as string) || '',
          reviewer: (ws.reviewer as string) || 'buddy',
          engineTag: (ws.engineTag as string) || 'K',
          isGate: (ws.isGate as boolean) || false,
        })),
      }));
      setWeeks(w);

      const phasesArr = Array.isArray(parsed.phases) ? parsed.phases : [];
      const p: PhaseField[] = phasesArr.map((ph: Record<string, unknown>) => ({
        num: typeof ph.num === 'number' ? ph.num : 1,
        title: (ph.title as string) || '',
        days: (ph.days as string) || `Days 1–30`,
        worksheets: Array.isArray(ph.worksheets) ? (ph.worksheets as string[]) : [],
      }));
      setPhases(p);

      const gateArtifacts = parsed.gateArtifacts as Record<string, unknown[]> || {};
      const g: GateField[] = Object.entries(gateArtifacts).map(([gateId, artifacts]) => ({
        gateId,
        artifacts: (Array.isArray(artifacts) ? artifacts : []).map(a => ({
          label: ((a as Record<string, unknown>).label as string) || '',
          required: ((a as Record<string, unknown>).required as boolean) || false,
        })),
      }));
      setGates(g);

      setValidationResult(null);
    } catch {
      // Invalid JSON — ignore parse
    }
  }, [jsonInput]);

  // ── Build JSON from form fields ────────────────────────
  const buildJson = useCallback(() => {
    const structure: Record<string, unknown> = {};

    if (weeks.length > 0) {
      structure.weeks = weeks.map(w => ({
        num: w.num,
        title: w.title,
        subtitle: w.subtitle,
        days: w.days,
        theme: w.theme,
        worksheets: w.worksheets
          .filter(ws => ws.id.trim())
          .map(ws => ({
            id: ws.id,
            title: ws.title,
            reviewer: ws.reviewer,
            engineTag: ws.engineTag,
            ...(ws.isGate ? { isGate: true } : {}),
          })),
      }));
    }

    if (phases.length > 0) {
      structure.phases = phases.map(p => ({
        num: p.num,
        title: p.title,
        days: p.days,
        worksheets: p.worksheets.filter(id => id.trim()),
      }));
    }

    if (gates.length > 0) {
      const artifacts: Record<string, unknown[]> = {};
      gates.forEach(g => {
        if (g.gateId.trim()) {
          artifacts[g.gateId] = g.artifacts.filter(a => a.label.trim()).map(a => ({
            label: a.label,
            required: a.required,
          }));
        }
      });
      if (Object.keys(artifacts).length > 0) {
        structure.gateArtifacts = artifacts;
      }
    }

    const json = JSON.stringify(structure, null, 2);
    onJsonChange(json);

    // Validate
    const errors = validateTemplateStructure(structure);
    setValidationResult(errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors });
  }, [weeks, phases, gates, onJsonChange]);



  // ── Week handlers ─────────────────────────────────────
  const addWeek = () => {
    const newWeek = { ...EMPTY_WEEK(), num: weeks.length + 1 };
    setWeeks([...weeks, newWeek]);
    setExpandedWeeks(new Set([...expandedWeeks, weeks.length]));
  };

  const removeWeek = (idx: number) => {
    const updated = weeks.filter((_, i) => i !== idx).map((w, i) => ({ ...w, num: i + 1 }));
    setWeeks(updated);
  };

  const updateWeek = (idx: number, field: keyof WeekField, value: unknown) => {
    const updated = [...weeks];
    const week = updated[idx]!;
    updated[idx] = { ...week, [field]: value };
    setWeeks(updated);
  };

  const addWorksheet = (weekIdx: number) => {
    const updated = [...weeks];
    updated[weekIdx]!.worksheets.push(EMPTY_WORKSHEET());
    setWeeks(updated);
  };

  const removeWorksheet = (weekIdx: number, wsIdx: number) => {
    const updated = [...weeks];
    const week = updated[weekIdx]!;
    week.worksheets = week.worksheets.filter((_, i) => i !== wsIdx);
    updated[weekIdx] = week;
    setWeeks(updated);
  };

  const updateWorksheet = (weekIdx: number, wsIdx: number, field: keyof WorksheetField, value: unknown) => {
    const updated = [...weeks];
    const ws = updated[weekIdx]!.worksheets[wsIdx]!;
    updated[weekIdx]!.worksheets[wsIdx] = { ...ws, [field]: value };
    setWeeks(updated);
  };

  // ── Phase handlers ────────────────────────────────────
  const addPhase = () => {
    setPhases([...phases, { ...EMPTY_PHASE(), num: phases.length + 1 }]);
  };

  const removePhase = (idx: number) => {
    const updated = phases.filter((_, i) => i !== idx).map((p, i) => ({ ...p, num: i + 1 }));
    setPhases(updated);
  };

  const updatePhase = (idx: number, field: keyof PhaseField, value: unknown) => {
    const updated = [...phases];
    const phase = updated[idx]!;
    updated[idx] = { ...phase, [field]: value };
    setPhases(updated);
  };

  const addPhaseWorksheet = (phaseIdx: number, wsId: string) => {
    const updated = [...phases];
    const phase = updated[phaseIdx]!;
    if (!phase.worksheets.includes(wsId)) {
      phase.worksheets.push(wsId);
    }
    updated[phaseIdx] = phase;
    setPhases(updated);
  };

  const removePhaseWorksheet = (phaseIdx: number, wsIdx: number) => {
    const updated = [...phases];
    const phase = updated[phaseIdx]!;
    phase.worksheets = phase.worksheets.filter((_, i) => i !== wsIdx);
    updated[phaseIdx] = phase;
    setPhases(updated);
  };

  // ── Gate handlers ─────────────────────────────────────
  const addGate = () => {
    setGates([...gates, EMPTY_GATE()]);
  };

  const removeGate = (idx: number) => {
    setGates(gates.filter((_, i) => i !== idx));
  };

  const updateGate = (idx: number, field: keyof GateField, value: unknown) => {
    const updated = [...gates];
    const gate = updated[idx]!;
    updated[idx] = { ...gate, [field]: value };
    setGates(updated);
  };

  const addArtifact = (gateIdx: number) => {
    const updated = [...gates];
    updated[gateIdx]!.artifacts.push(EMPTY_ARTIFACT());
    setGates(updated);
  };

  const removeArtifact = (gateIdx: number, artIdx: number) => {
    const updated = [...gates];
    const gate = updated[gateIdx]!;
    gate.artifacts = gate.artifacts.filter((_, i) => i !== artIdx);
    updated[gateIdx] = gate;
    setGates(updated);
  };

  const updateArtifact = (gateIdx: number, artIdx: number, field: keyof GateArtifactField, value: unknown) => {
    const updated = [...gates];
    const art = updated[gateIdx]!.artifacts[artIdx]!;
    updated[gateIdx]!.artifacts[artIdx] = { ...art, [field]: value };
    setGates(updated);
  };

  const toggleWeek = (idx: number) => {
    const newSet = new Set(expandedWeeks);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setExpandedWeeks(newSet);
  };

  // ─── Input Style ───────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', boxSizing: 'border-box',
    border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
    fontFamily: 'var(--font-body)', fontSize: '0.78rem',
    color: 'var(--color-charcoal)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'var(--font-body)',
    fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--color-charcoal)',
    marginBottom: '4px',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 400,
    color: 'var(--color-charcoal)', marginBottom: '1rem',
  };

  return (
    <div>
      {/* Toggle: Visual vs Advanced */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid rgba(26,26,26,0.12)', paddingBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setUseAdvanced(false)}
          style={{
            padding: '6px 14px', border: '1px solid',
            borderColor: useAdvanced ? 'rgba(26,26,26,0.2)' : 'var(--color-charcoal)',
            background: useAdvanced ? 'transparent' : 'var(--color-charcoal)',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: useAdvanced ? 'var(--color-warm-grey)' : '#F9F8F6',
          }}
        >
          Visual Builder
        </button>
        <button
          type="button"
          onClick={() => setUseAdvanced(true)}
          style={{
            padding: '6px 14px', border: '1px solid',
            borderColor: useAdvanced ? 'var(--color-charcoal)' : 'rgba(26,26,26,0.2)',
            background: useAdvanced ? 'var(--color-charcoal)' : 'transparent',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: useAdvanced ? '#F9F8F6' : 'var(--color-warm-grey)',
          }}
        >
          Advanced (JSON)
        </button>
      </div>

      {useAdvanced ? (
        /* ─── Advanced JSON Editor ──────────────────── */
        <div>
          <textarea
            value={jsonInput}
            onChange={e => onJsonChange(e.target.value)}
            rows={18}
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box',
              border: '1px solid rgba(26,26,26,0.2)', background: 'rgba(26,26,26,0.02)',
              fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: 1.5,
              color: 'var(--color-charcoal)', resize: 'vertical',
            }}
          />
        </div>
      ) : (
        /* ─── Visual Builder ────────────────────────── */
        <div>
          {/* Parse JSON button */}
          {weeks.length === 0 && phases.length === 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={parseJsonToFields}
                style={{
                  padding: '6px 14px', border: '1px solid rgba(26,26,26,0.2)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.65rem',
                  fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--color-charcoal)',
                }}
              >
                Load from current JSON
              </button>
            </div>
          )}

          {/* ════════ WEEKS ════════ */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={sectionHeaderStyle}>Weeks</h3>
              <button type="button" onClick={addWeek}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                  border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--color-charcoal)',
                }}>
                <Plus size={12} strokeWidth={2} /> Add Week
              </button>
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} style={{
                marginBottom: '1rem', border: '1px solid rgba(26,26,26,0.12)',
                overflow: 'hidden',
              }}>
                {/* Week header */}
                <div
                  onClick={() => toggleWeek(wi)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 12px', cursor: 'pointer',
                    background: 'rgba(26,26,26,0.03)',
                    borderBottom: expandedWeeks.has(wi) ? '1px solid rgba(26,26,26,0.06)' : 'none',
                  }}
                >
                  {expandedWeeks.has(wi) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 500, flex: 1 }}>
                    Week {week.num}{week.title ? `: ${week.title}` : ''}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-warm-grey)', fontFamily: 'var(--font-body)' }}>
                    {week.worksheets.filter(w => w.id.trim()).length} worksheets
                  </span>
                  {wi > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeWeek(wi); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '2px' }}>
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* Week fields */}
                {expandedWeeks.has(wi) && (
                  <div style={{ padding: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Title</label>
                        <input style={inputStyle} value={week.title}
                          onChange={e => updateWeek(wi, 'title', e.target.value)}
                          placeholder="e.g. Anchor" />
                      </div>
                      <div>
                        <label style={labelStyle}>Subtitle</label>
                        <input style={inputStyle} value={week.subtitle}
                          onChange={e => updateWeek(wi, 'subtitle', e.target.value)}
                          placeholder="e.g. Observe begins" />
                      </div>
                      <div>
                        <label style={labelStyle}>Days</label>
                        <input style={inputStyle} value={week.days}
                          onChange={e => updateWeek(wi, 'days', e.target.value)}
                          placeholder="e.g. Week 1" />
                      </div>
                      <div>
                        <label style={labelStyle}>Theme</label>
                        <input style={inputStyle} value={week.theme}
                          onChange={e => updateWeek(wi, 'theme', e.target.value)}
                          placeholder="e.g. Context before content" />
                      </div>
                    </div>

                    {/* Worksheets within week */}
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>
                          Worksheets
                        </span>
                        <button type="button" onClick={() => addWorksheet(wi)}
                          style={{ padding: '2px 8px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>
                          <Plus size={10} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> Add
                        </button>
                      </div>

                      {week.worksheets.map((ws, wsi) => (
                        <div key={wsi} style={{
                          display: 'flex', gap: '6px', alignItems: 'center',
                          padding: '6px 8px', marginBottom: '4px',
                          border: '1px solid rgba(26,26,26,0.06)',
                          background: 'rgba(26,26,26,0.02)',
                        }}>
                          <input style={{ ...inputStyle, width: '80px', flexShrink: 0, fontSize: '0.7rem' }}
                            value={ws.id}
                            onChange={e => updateWorksheet(wi, wsi, 'id', e.target.value)}
                            placeholder="ID" />
                          <input style={{ ...inputStyle, flex: 1 }}
                            value={ws.title}
                            onChange={e => updateWorksheet(wi, wsi, 'title', e.target.value)}
                            placeholder="Title" />
                          <select style={{ ...inputStyle, width: '120px', flexShrink: 0, fontSize: '0.65rem' }}
                            value={ws.reviewer}
                            onChange={e => updateWorksheet(wi, wsi, 'reviewer', e.target.value)}>
                            {REVIEWER_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <select style={{ ...inputStyle, width: '80px', flexShrink: 0, fontSize: '0.65rem' }}
                            value={ws.engineTag}
                            onChange={e => updateWorksheet(wi, wsi, 'engineTag', e.target.value)}>
                            {ENGINE_TAG_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.value}</option>
                            ))}
                          </select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                            <input type="checkbox" checked={ws.isGate}
                              onChange={e => updateWorksheet(wi, wsi, 'isGate', e.target.checked)} />
                            Gate
                          </label>
                          {wsi > 0 && (
                            <button type="button" onClick={() => removeWorksheet(wi, wsi)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '2px' }}>
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {weeks.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', padding: '1rem 0', textAlign: 'center' }}>
                No weeks defined. Click &quot;Add Week&quot; to start building your template.
              </p>
            )}
          </div>

          {/* ════════ PHASES ════════ */}
          <div style={{ marginBottom: '2rem', borderTop: '1px solid rgba(26,26,26,0.12)', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={sectionHeaderStyle}>Phases</h3>
              <button type="button" onClick={addPhase}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                  border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--color-charcoal)',
                }}>
                <Plus size={12} strokeWidth={2} /> Add Phase
              </button>
            </div>

            {phases.map((phase, pi) => (
              <div key={pi} style={{
                padding: '12px', marginBottom: '10px',
                border: '1px solid rgba(26,26,26,0.12)',
              }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Title</label>
                    <input style={inputStyle} value={phase.title}
                      onChange={e => updatePhase(pi, 'title', e.target.value)}
                      placeholder="e.g. Phase 1 — Orientation" />
                  </div>
                  <div style={{ width: '150px' }}>
                    <label style={labelStyle}>Days</label>
                    <input style={inputStyle} value={phase.days}
                      onChange={e => updatePhase(pi, 'days', e.target.value)}
                      placeholder="e.g. Days 1–30" />
                  </div>
                  <button type="button" onClick={() => removePhase(pi)}
                    style={{ alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '8px 4px' }}>
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>

                {/* Phase worksheet IDs */}
                <div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', display: 'block', marginBottom: '4px' }}>
                    Worksheet IDs
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {phase.worksheets.map((wsId, wsi) => (
                      <span key={wsi} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', fontSize: '0.6rem', fontFamily: 'var(--font-body)',
                        border: '1px solid rgba(26,26,26,0.15)', background: 'rgba(26,26,26,0.03)',
                      }}>
                        {wsId}
                        <button type="button" onClick={() => removePhaseWorksheet(pi, wsi)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: 0, fontSize: '10px' }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input style={{ ...inputStyle, width: '150px', fontSize: '0.7rem' }}
                      placeholder="Add worksheet ID"
                      id={`phase-ws-input-${pi}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget;
                          const val = input.value.trim();
                          if (val) { addPhaseWorksheet(pi, val); input.value = ''; }
                        }
                      }} />
                    <button type="button"
                      onClick={() => {
                        const input = document.getElementById(`phase-ws-input-${pi}`) as HTMLInputElement;
                        if (input && input.value.trim()) {
                          addPhaseWorksheet(pi, input.value.trim());
                          input.value = '';
                        }
                      }}
                      style={{ padding: '4px 10px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent', cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'var(--font-body)' }}>
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {phases.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', textAlign: 'center', padding: '1rem 0' }}>
                No phases defined. Click &quot;Add Phase&quot; to add phase structure.
              </p>
            )}
          </div>

          {/* ════════ GATE ARTIFACTS ════════ */}
          <div style={{ marginBottom: '2rem', borderTop: '1px solid rgba(26,26,26,0.12)', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={sectionHeaderStyle}>Gate Artifacts</h3>
              <button type="button" onClick={addGate}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                  border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--color-charcoal)',
                }}>
                <Plus size={12} strokeWidth={2} /> Add Gate
              </button>
            </div>

            {gates.map((gate, gi) => (
              <div key={gi} style={{
                padding: '12px', marginBottom: '10px',
                border: '1px solid rgba(26,26,26,0.12)',
              }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Gate ID</label>
                    <input style={inputStyle} value={gate.gateId}
                      onChange={e => updateGate(gi, 'gateId', e.target.value)}
                      placeholder="e.g. w1_g1" />
                  </div>
                  <button type="button" onClick={() => removeGate(gi)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '8px 4px' }}>
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>

                {/* Artifacts */}
                <div style={{ marginLeft: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>
                      Artifacts
                    </span>
                    <button type="button" onClick={() => addArtifact(gi)}
                      style={{ padding: '2px 8px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>
                      <Plus size={10} strokeWidth={2} /> Add
                    </button>
                  </div>

                  {gate.artifacts.map((art, ai) => (
                    <div key={ai} style={{
                      display: 'flex', gap: '6px', alignItems: 'center',
                      padding: '4px 6px', marginBottom: '4px',
                      border: '1px solid rgba(26,26,26,0.06)',
                    }}>
                      <input style={{ ...inputStyle, flex: 1, fontSize: '0.7rem' }}
                        value={art.label}
                        onChange={e => updateArtifact(gi, ai, 'label', e.target.value)}
                        placeholder="Artifact description" />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input type="checkbox" checked={art.required}
                          onChange={e => updateArtifact(gi, ai, 'required', e.target.checked)} />
                        Required
                      </label>
                      {ai > 0 && (
                        <button type="button" onClick={() => removeArtifact(gi, ai)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '2px' }}>
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {gates.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', textAlign: 'center', padding: '1rem 0' }}>
                No gate artifacts defined. Gates represent milestone checkpoints with required evidence.
              </p>
            )}
          </div>

          {/* ─── Generate JSON Button ──────────────────── */}
          <div style={{ borderTop: '1px solid rgba(26,26,26,0.12)', paddingTop: '1.5rem' }}>
            <button type="button" onClick={buildJson}
              style={{
                padding: '8px 20px',
                border: '1px solid var(--color-charcoal)',
                background: 'var(--color-charcoal)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#F9F8F6',
              }}>
              Generate JSON Structure
            </button>
          </div>

          {/* Validation result */}
          {validationResult && (
            <div style={{
              marginTop: '1rem', padding: '0.75rem 1rem',
              border: '1px solid',
              borderColor: validationResult.valid ? '#A5D6A7' : '#EF9A9A',
              background: validationResult.valid ? '#E8F5E9' : '#FFEBEE',
            }}>
              {validationResult.valid ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} strokeWidth={1.5} style={{ color: '#2E7D32', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#2E7D32' }}>
                    Structure is valid!
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <AlertCircle size={16} strokeWidth={1.5} style={{ color: '#C62828', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: '#C62828' }}>
                      Validation Errors
                    </span>
                  </div>
                  {validationResult.errors.map((err, i) => (
                    <p key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#795548', margin: '2px 0', paddingLeft: '24px' }}>
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
