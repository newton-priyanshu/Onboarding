import { useNavigate } from 'react-router-dom';
import { Shield, Eye, FileText } from 'lucide-react';
import { PHASE_WORKSHEETS_MAP, getPhaseReviewStatus, type WorksheetSubmission, type UserProfile } from '../../config/worksheetConfig';
import { t } from '../../config/theme';

interface PhasesReadyTabProps {
  allWorksheets: WorksheetSubmission[];
  instructors: UserProfile[];
  isManager: boolean;
}

interface PhaseEntry {
  userId: string;
  userName: string;
  phaseNum: number;
  status: ReturnType<typeof getPhaseReviewStatus>;
  hasSubmissions: boolean;
}

export default function PhasesReadyTab({ allWorksheets, instructors, isManager }: PhasesReadyTabProps) {
  const navigate = useNavigate();

  const readyEntries: PhaseEntry[] = [];
  const inProgressEntries: PhaseEntry[] = [];

  instructors.forEach(instr => {
    for (const phaseNum of [1, 2, 3]) {
      const status = getPhaseReviewStatus(phaseNum, allWorksheets, instr.id);
      const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
      const hasSubmissions = allWorksheets.some(w => w.user_id === instr.id && wsList.includes(w.worksheet_id));

      if (status.ready && status.total > 0) {
        readyEntries.push({ userId: instr.id, userName: instr.full_name || instr.id, phaseNum, status, hasSubmissions });
      } else if (isManager && hasSubmissions && status.total > 0) {
        // Academic head: also show phases that have submissions but aren't yet fully ready
        inProgressEntries.push({ userId: instr.id, userName: instr.full_name || instr.id, phaseNum, status, hasSubmissions });
      }
    }
  });

  const totalEntries = readyEntries.length + inProgressEntries.length;

  if (totalEntries === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>All Caught Up</p>
        <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No phases have submissions yet.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Ready phases (for manager approval) */}
      {readyEntries.length > 0 && (
        <>
          <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.purple, marginBottom: '1.5rem' }}>
            Ready for {isManager ? 'Approval' : 'Monitoring'} ({readyEntries.length})
          </p>
          {readyEntries.map((entry, idx) => (
            <div key={`ready-${entry.userId}-${entry.phaseNum}`} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0',
              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
              opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
            }}>
              <div style={{ width: '40px', height: '40px', border: '1px solid ' + t.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield size={18} strokeWidth={1.5} style={{ color: t.purple }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>
                  {entry.userName}
                  <span style={{ color: t.wg, fontWeight: 400 }}> · Phase {entry.phaseNum} ready</span>
                </p>
                <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>
                  {entry.status.buddyApproved}/{entry.status.total} worksheets buddy-approved
                </p>
              </div>
              {isManager ? (
                <button onClick={() => navigate(`/admin/review-phase/${entry.userId}/${entry.phaseNum}`)}
                  style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', border: '1px solid ' + t.purple, background: t.purple, color: '#FFF', cursor: 'pointer' }}>
                  Approve Phase
                </button>
              ) : (
                <button onClick={() => navigate(`/onboarding-lead/review-phase/${entry.userId}/${entry.phaseNum}`)}
                  style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', border: '1px solid ' + t.info, background: 'transparent', color: t.info, cursor: 'pointer' }}>
                  <Eye size={12} strokeWidth={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> View Phase
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* In-progress phases (academic head only — read-only viewing) */}
      {inProgressEntries.length > 0 && (
        <>
          <p style={{
            fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: t.ch, marginTop: readyEntries.length > 0 ? '2rem' : 0,
            marginBottom: '1.5rem',
          }}>
            In Progress — View Only ({inProgressEntries.length})
          </p>
          {inProgressEntries.map((entry, idx) => {
            const buddyApproved = entry.status.buddyApproved;
            const pending = entry.status.total - entry.status.buddyApproved - entry.status.notSubmitted;
            return (
              <div key={`progress-${entry.userId}-${entry.phaseNum}`} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0',
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
              }}>
                <div style={{ width: '40px', height: '40px', border: '1px solid ' + t.ch, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={18} strokeWidth={1.5} style={{ color: t.ch }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>
                    {entry.userName}
                    <span style={{ color: t.wg, fontWeight: 400 }}> · Phase {entry.phaseNum}</span>
                  </p>
                  <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>
                    {buddyApproved > 0 && `${buddyApproved} approved · `}
                    {pending > 0 && `${pending} pending · `}
                    {entry.status.notSubmitted > 0 && `${entry.status.notSubmitted} not started`}
                  </p>
                </div>
                <button onClick={() => navigate(`/admin/review-phase/${entry.userId}/${entry.phaseNum}`)}
                  style={{
                    fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em',
                    textTransform: 'uppercase', padding: '8px 20px',
                    border: '1px solid ' + t.ch, background: 'transparent', color: t.ch, cursor: 'pointer',
                    transition: 'all 200ms ' + t.ease,
                  }}>
                  <Eye size={12} strokeWidth={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> View Phase
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
