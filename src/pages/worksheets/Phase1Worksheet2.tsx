import { MessageSquare } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankWeek = () => ({ date: '', topics: '', actions: '', mentorSignoff: false });

export default function Phase1Worksheet2() {
  return (
    <WorksheetPage
      worksheetId="p1_w2" phase="phase-1" icon={MessageSquare}
      title="Faculty Mentor Alignment & Weekly Sync Tracker"
      subtitle="Days 1-30 · Track weekly mentor sync sessions."
      backTo="/phase-1"
      defaultData={{
        employeeName: '', mentorName: '',
        weeks: Array(4).fill(null).map(() => ({ ...blankWeek(), mentorSignoff: false })),
        mentorStrengths: '', mentorAreasForGrowth: '', mentorReadiness: '',
      }}
      requiredFields={[
        { key: 'employeeName', label: 'Full Name' },
        { key: 'mentorName', label: 'Mentor Name' },
      ]}
      approvedMsg="Your Faculty Mentor Alignment worksheet has been reviewed and approved."
      submittedMsg="Your Faculty Mentor Alignment & Weekly Sync Tracker has been submitted for review."
      buddyApproveMsg="Your Faculty Mentor Sync worksheet has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const updateWeek = (i: number, f: string, v: string | boolean) => setData(p => { const arr = [...p.weeks]; arr[i] = { ...arr[i], [f]: v }; return { ...p, weeks: arr }; });
        return (
          <>
            <WorksheetSection title="About You">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FieldGroup label="Full Name" required>
                  <input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} />
                </FieldGroup>
                <FieldGroup label="Mentor Name" required>
                  <input className="lux-input" placeholder="Your mentor's name" value={data.mentorName} onChange={e => updateField('mentorName', e.target.value)} />
                </FieldGroup>
              </div>
            </WorksheetSection>

            <WorksheetSection title="Weekly Mentor Sync Tracker" subtitle="Each session should cover progress, blockers, and one learning goal for the coming week.">
              {(data.weeks as Array<Record<string, unknown>>).map((week, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(26,26,26,0.06)', paddingBottom: '1rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Week {i + 1}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>
                      <input type="checkbox" checked={week.mentorSignoff as boolean} onChange={e => updateWeek(i, 'mentorSignoff', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
                      Mentor Sign-off
                    </label>
                  </div>
                  <input className="lux-input" type="date" value={week.date as string} onChange={e => updateWeek(i, 'date', e.target.value)} style={{ marginBottom: '8px' }} />
                  <textarea className="lux-textarea" rows={2} placeholder="Topics Discussed" value={week.topics as string} onChange={e => updateWeek(i, 'topics', e.target.value)} />
                  <textarea className="lux-textarea" rows={2} placeholder="Actions / Follow-ups" value={week.actions as string} onChange={e => updateWeek(i, 'actions', e.target.value)} style={{ marginTop: '8px' }} />
                </div>
              ))}
            </WorksheetSection>

            <WorksheetSection title="Mentor Feedback Summary (End of Phase 1)" subtitle="To be filled by your mentor — a brief assessment of your progress.">
              <FieldGroup label="What strengths has the mentee demonstrated so far?"><textarea className="lux-textarea" rows={1} value={data.mentorStrengths} onChange={e => updateField('mentorStrengths', e.target.value)} /></FieldGroup>
              <FieldGroup label="What areas need focused development?"><textarea className="lux-textarea" rows={1} value={data.mentorAreasForGrowth} onChange={e => updateField('mentorAreasForGrowth', e.target.value)} /></FieldGroup>
              <FieldGroup label="Overall readiness to proceed to Phase 2?"><textarea className="lux-textarea" rows={1} value={data.mentorReadiness} onChange={e => updateField('mentorReadiness', e.target.value)} /></FieldGroup>
            </WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
