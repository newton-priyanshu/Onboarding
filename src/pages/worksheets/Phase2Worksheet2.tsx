import { ClipboardCheck } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankSession = () => ({ date: '', subject: '', observer: '', notes: '' });
const dims = ['Explained problem statement clearly', 'Circulated and helped multiple students', 'Debugged without giving answers', 'Managed 90-min lab time', 'Maintained student engagement'];

export default function Phase2Worksheet2() {
  return (
    <WorksheetPage
      worksheetId="p2_w2" phase="phase-2" icon={ClipboardCheck}
      title="Independent Lab Facilitation Scorecard & Feedback Tracker"
      subtitle="Days 31-60 · Build lab facilitation confidence."
      backTo="/phase-2"
      defaultData={{
        employeeName: '',
        sessions: Array(2).fill(null).map(() => blankSession()),
        dimScores: dims.map(() => [0, 0]),
        strongestMoment: '', biggestChallenge: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Lab Scorecard has been reviewed and approved."
      submittedMsg="Lab scorecard submitted."
      buddyApproveMsg="Your Lab Scorecard has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uS = (i: number, f: string, v: string) => setData(p => { const arr = [...p.sessions]; arr[i] = { ...arr[i], [f]: v }; return { ...p, sessions: arr }; });
        const uScore = (dimIdx: number, sessionIdx: number, v: number) => setData(p => { const arr = [...p.dimScores]; arr[dimIdx] = [...arr[dimIdx]]; arr[dimIdx][sessionIdx] = v; return { ...p, dimScores: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Lab Session Log" subtitle="Min. 2 independent sessions required.">
              <div className="ws-scroll-x">
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Date', 'Subject / Topic', 'Observer', 'Observer Notes'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
                </div>
                {(data.sessions as Array<Record<string, string>>).map((s, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 2.5fr', gap: '8px' }}>
                    <label htmlFor={`sess-date-${i}`} className="ws-sr-only">Date (row {i + 1})</label>
                    <input id={`sess-date-${i}`} className="lux-input" type="date" value={s.date} onChange={e => uS(i, 'date', e.target.value)} />
                    <label htmlFor={`sess-subject-${i}`} className="ws-sr-only">Subject / Topic (row {i + 1})</label>
                    <input id={`sess-subject-${i}`} className="lux-input" placeholder="Subject" value={s.subject} onChange={e => uS(i, 'subject', e.target.value)} />
                    <label htmlFor={`sess-observer-${i}`} className="ws-sr-only">Observer (row {i + 1})</label>
                    <input id={`sess-observer-${i}`} className="lux-input" placeholder="Observer" value={s.observer} onChange={e => uS(i, 'observer', e.target.value)} />
                    <label htmlFor={`sess-notes-${i}`} className="ws-sr-only">Observer Notes (row {i + 1})</label>
                    <input id={`sess-notes-${i}`} className="lux-input" placeholder="Observer notes" value={s.notes} onChange={e => uS(i, 'notes', e.target.value)} />
                  </div>
                ))}
              </div>
            </WorksheetSection>
            <WorksheetSection title="Facilitation Scorecard" subtitle="Rate each dimension 1-5 per session.">
              {dims.map((dim, di) => (
                <div key={di} style={{ padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '6px' }}>{dim}</p>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {[0, 1].map(si => (
                      <div key={si} style={{ flex: 1 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-warm-grey)', letterSpacing: '0.1em' }}>Session {si + 1}: </span>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--color-gold)' }}>{data.dimScores[di][si]}/5</span>
                        <div role="group" aria-label={`${dim} — Session ${si + 1} rating`} style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          {[1, 2, 3, 4, 5].map(v => (
                            <button key={v} type="button" className="ws-star-btn" onClick={() => uScore(di, si, v)}
                              aria-label={`Rate ${v}`}
                              aria-pressed={data.dimScores[di][si] >= v}
                              style={{
                                flex: 1, cursor: 'pointer',
                                border: data.dimScores[di][si] >= v ? '1px solid var(--color-charcoal)' : '1px solid rgba(26,26,26,0.15)',
                                background: data.dimScores[di][si] >= v ? 'var(--color-charcoal)' : 'transparent',
                                color: data.dimScores[di][si] >= v ? '#F9F8F6' : 'var(--color-warm-grey)',
                                fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
                                transition: 'all 200ms var(--ease-lux)',
                              }}>{v}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Reflection">
              <FieldGroup label="Strongest moment in lab facilitation this phase:" id="strongestMoment"><textarea id="strongestMoment" className="lux-textarea" rows={2} value={data.strongestMoment} onChange={e => updateField('strongestMoment', e.target.value)} /></FieldGroup>
              <FieldGroup label="Biggest challenge faced and how you handled it:" id="biggestChallenge"><textarea id="biggestChallenge" className="lux-textarea" rows={2} value={data.biggestChallenge} onChange={e => updateField('biggestChallenge', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature" id="employeeSignature"><input id="employeeSignature" className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
