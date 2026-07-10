import { ClipboardList, CheckCircle2 } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w1_o1';
const phase = 'week-1';

export default function W1O1() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={ClipboardList}
      title="Day 1 Logistics, Access & Buddy Assignment"
      subtitle="Getting set up — access, buddy contact, comms channels"
      backTo="/week-1"
      defaultData={{
        employeeName: '',
        accessVerified: false,
        buddyContacted: false,
        commsJoined: false,
        laptopSetup: false,
        portalAccess: false,
        slackChannels: [] as string[],
        notes: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg="Your Day 1 Logistics checklist has been approved."
      submittedMsg="Your logistics checklist has been submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Access Verification">
            <FieldGroup label="Your Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} placeholder="e.g. Jane Smith" />
            </FieldGroup>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {[
                { k: 'accessVerified', l: 'Building access card issued & activated' },
                { k: 'laptopSetup', l: 'Laptop issued, configured, and tested' },
                { k: 'portalAccess', l: 'Learning portal login working (student + faculty view)' },
                { k: 'buddyContacted', l: 'Buddy assigned and initial contact made' },
                { k: 'commsJoined', l: 'Joined all required communication channels (Slack, email groups)' },
              ].map(item => (
                <label key={item.k} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={!!(data[item.k] as boolean)} onChange={e => updateField(item.k, e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
                  <span>{item.l}</span>
                  {(data[item.k] as boolean) && <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--color-success)', marginLeft: 'auto' }} />}
                </label>
              ))}
            </div>
          </WorksheetSection>

          <WorksheetSection title="Slack Channels Joined">
            <FieldGroup label="Which channels have you joined?" id="slackChannels">
              <textarea id="slackChannels" className="lux-textarea" rows={3} value={(data.slackChannels as string[])?.join(', ') || ''}
                onChange={e => updateField('slackChannels', e.target.value.split(',').map(s => s.trim()))}
                placeholder="e.g. #general, #faculty, #onboarding-july" />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Notes / Questions">
            <FieldGroup label="Any questions or issues from Day 1?" id="notes">
              <textarea id="notes" className="lux-textarea" rows={3} value={data.notes as string} onChange={e => updateField('notes', e.target.value)}
                placeholder="Anything unclear, missing access, or follow-ups needed..." />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
