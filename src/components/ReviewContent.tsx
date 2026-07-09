import { t } from '../config/theme';
import { CheckCircle2, XCircle, Star, Calendar, FileText, ClipboardCheck, Signature, Shield } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────

interface ReviewContentProps {
  data: Record<string, unknown>;
  worksheetId: string;
}

interface SignatureBadgeProps {
  value: string;
}

interface DateBadgeProps {
  value: string;
}

interface StringFieldProps {
  keyProp: string;
  value: string | number | boolean;
}

interface TableRendererProps {
  data: Record<string, unknown>[];
  headers: string[];
}

interface ChecklistRendererProps {
  items: boolean[];
  label: string;
}

interface ScoreGridRendererProps {
  scores: number[][];
  labels: string[] | null;
}

interface MilestoneRendererProps {
  worksheetId: string;
  values: string[];
  label: string;
}

interface MilestoneLabel {
  outcome: string;
  verify: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function toLabel(str: string): string {
  if (!str) return '';
  const label = str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
  const overrides: Record<string, string> = {
    'Employee Name': 'Employee Name',
    'Employee Signature': 'Employee Signature',
    'Demo Signature': 'Faculty Lead Signature',
    'Lead Signature': 'Faculty Lead Signature',
    'Mentor Name': 'Mentor Name',
    'Mentor Strengths': 'Mentor Strengths',
    'Mentor Readiness': 'Readiness Assessment',
    'Mentor Areas For Growth': 'Areas for Growth',
    'Top Misconceptions': 'Top Misconceptions',
    'Content Decisions': 'Content Decisions',
    'Highest Impact': 'Highest Impact Improvement',
    'Reflection Learning From': 'Learning from Stakeholders',
    'Total Students': 'Total Students',
    'Cohort Names': 'Cohort Names',
    'Date Know Names': 'Date to Know All Names',
    'Support Struggling': 'Supporting Struggling Students',
    'Utilize High Performers': 'Utilizing High Performers',
    'Strongest Moment': 'Strongest Moment',
    'Biggest Challenge': 'Biggest Challenge',
    'Proposal Title': 'Proposal Title',
    'Area Of Improvement': 'Area of Improvement',
    'Subject Affected': 'Subject Affected',
    'Problem Statement': 'Problem Statement',
    'Proposed Solution': 'Proposed Solution',
    'Expected Impact': 'Expected Impact',
    'Implementation Effort': 'Implementation Effort',
    'Lead Decision': 'Faculty Lead Decision',
    'Lead Comments': 'Faculty Lead Comments',
    'Lead Timeline': 'Implementation Timeline',
    'Self Natural': 'Most Natural Framework',
    'Self Effort': 'Requires Most Effort',
    'Self Moment': 'Proud Moment',
  };
  return overrides[label] || label;
}

function isSignature(key: string): boolean {
  const k = key.toLowerCase();
  return k.includes('signature');
}

function isDateField(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'date' || k === 'startdate' || k === 'enddate' || k === 'demoDate'
    || k === 'datedemo' || k === 'dateknownames' || k === 'buddyassignmentdate'
    || k === 'datesubmitted' || k === 'datesubmittedmeta';
}

function shouldSkip(key: string): boolean {
  if (key.startsWith('_')) return true;
  const skipFields = ['status', 'datesubmitted', 'datesubmittedmeta'];
  return skipFields.includes(key.toLowerCase());
}

function isBooleanField(key: string): boolean {
  const k = key.toLowerCase();
  const booleans = ['mentorsignoff', 'selfassessed', 'verified', 'submitted', 'approved', 'tested', 'self'];
  return booleans.includes(k);
}

// ─── Sub-renderers ──────────────────────────────────────────────────────

function renderValue(value: unknown, _key: string): React.ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') {
    return value
      ? <span style={{ color: t.success, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Yes</span>
      : <span style={{ color: '#9E9E9E', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><XCircle size={14} /> No</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ fontWeight: 600, color: 'var(--md-primary)' }}>{value}</span>;
  }
  return String(value);
}

function SignatureBadge({ value }: SignatureBadgeProps) {
  if (!value?.trim()) return <span className="body-small text-muted" style={{ fontStyle: 'italic' }}>Not signed</span>;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '6px 14px', borderRadius: 'var(--md-radius-pill)',
      background: '#FFF8E1', border: '1px solid #FFE082',
      fontFamily: '"Brush Script MT", "Segoe Script", cursive',
      fontSize: '1.1rem', color: '#5D4037',
    }}>
      <Signature size={14} style={{ color: '#F57F17' }} />
      {value}
    </div>
  );
}

function DateBadge({ value }: DateBadgeProps) {
  if (!value) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', borderRadius: 'var(--md-radius-pill)',
      background: '#E3F2FD', color: '#1565C0', fontSize: '0.8rem', fontWeight: 500,
    }}>
      <Calendar size={12} /> {value}
    </span>
  );
}

function StringField({ keyProp, value }: StringFieldProps) {
  if (!value && value !== 0 && typeof value !== 'boolean') return null;
  return (
    <div className="review-field" style={{ marginBottom: '0.5rem' }}>
      <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
        {toLabel(keyProp)}
      </span>
      <span className="body-medium" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--md-on-surface)' }}>
        {String(value)}
      </span>
    </div>
  );
}

function TableRenderer({ data, headers }: TableRendererProps) {
  if (!data || data.length === 0) return <p className="body-small text-muted" style={{ fontStyle: 'italic' }}>No entries</p>;

  const filled = data.filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined && v !== false));
  if (filled.length === 0) return <p className="body-small text-muted" style={{ fontStyle: 'italic' }}>No entries</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--md-primary-container)', color: 'var(--md-primary)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>#</th>
            {headers.map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--md-primary-container)', color: 'var(--md-primary)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                {toLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filled.map((row, idx) => (
            <tr key={idx} style={{
              background: idx % 2 === 0 ? 'transparent' : 'var(--md-surface-variant)30',
              transition: 'background 0.15s',
            }}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)', fontWeight: 500, fontSize: '0.7rem', width: '24px' }}>{idx + 1}</td>
              {headers.map(h => (
                <td key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                  {isBooleanField(h)
                    ? renderValue(row[h], h)
                    : isDateField(h)
                      ? <DateBadge value={String(row[h] || '')} />
                      : String(row[h] ?? '') || <span className="text-muted" style={{ fontStyle: 'italic', opacity: 0.5 }}>-</span>
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistRenderer({ items, label }: ChecklistRendererProps) {
  const checked = items.filter(Boolean).length;
  const total = items.length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <ClipboardCheck size={14} style={{ color: 'var(--md-primary)' }} />
        <span className="label-medium" style={{ fontSize: '0.75rem' }}>{label || 'Checklist'}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 'var(--md-radius-pill)', fontSize: '0.65rem', fontWeight: 600,
          background: checked === total ? '#E8F5E9' : '#FFF8E1', color: checked === total ? t.success : '#F57F17',
        }}>{checked}/{total}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((checkedItem, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
            borderRadius: 'var(--md-radius-sm)',
            color: checkedItem ? 'var(--md-on-surface)' : 'var(--md-outline)',
          }}>
            {checkedItem
              ? <CheckCircle2 size={14} style={{ color: '#2E7D32', flexShrink: 0 }} />
              : <XCircle size={14} style={{ color: '#BDBDBD', flexShrink: 0 }} />
            }
            <span style={{ fontSize: '0.78rem' }}>{toLabel(`Item ${i + 1}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreGridRenderer({ scores, labels }: ScoreGridRendererProps) {
  if (!scores || scores.length === 0) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Star size={14} style={{ color: 'var(--md-primary)' }} />
        <span className="label-medium" style={{ fontSize: '0.75rem' }}>Facilitation Scorecard (1-5)</span>
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {scores.map((row, di) => (
          <div key={di} style={{
            display: 'grid', gridTemplateColumns: '1.5fr repeat(auto-fit, minmax(40px, 1fr))',
            gap: '4px', padding: '6px 8px', borderRadius: 'var(--md-radius-sm)',
            background: di % 2 === 0 ? 'transparent' : 'var(--md-surface-variant)30',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--md-on-surface)' }}>{labels?.[di] || `Dimension ${di + 1}`}</span>
            {row.map((score, si) => (
              <div key={si} style={{
                textAlign: 'center', padding: '2px 4px', borderRadius: '4px',
                background: score >= 4 ? '#E8F5E9' : score >= 3 ? '#FFF8E1' : '#FFEBEE',
                color: score >= 4 ? t.success : score >= 3 ? t.warning : t.error,
                fontWeight: 600, fontSize: '0.75rem',
              }}>
                {score || '-'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gate Control Milestone Renderer ───────────────────────────────────

const GC_MILESTONE_LABELS: Record<string, MilestoneLabel[]> = {
  gc1: [
    { outcome: 'Portal proficiency — end-to-end', verify: 'Live demo with Faculty Lead' },
    { outcome: 'Clear understanding of course objectives', verify: 'Verbal explanation or short written summary' },
    { outcome: 'Awareness of classroom management norms', verify: 'Observation debrief with mentor' },
    { outcome: 'All Phase 1 worksheets submitted', verify: 'Compendium review by Faculty Lead' },
    { outcome: 'Ready for guided contribution', verify: 'Faculty Lead sign-off' },
  ],
  gc2: [
    { outcome: 'Confidently resolves student doubts independently', verify: 'Observed by mentor during doubt session' },
    { outcome: 'Runs lab sessions without guidance', verify: 'Faculty Lead lab observation' },
    { outcome: 'All content contributions reviewed and approved', verify: 'Content audit by Faculty Lead' },
    { outcome: 'Full advanced portal proficiency', verify: 'Live portal demonstration' },
    { outcome: 'All Phase 2 worksheets submitted', verify: 'Compendium review by Faculty Lead' },
  ],
  gc3: [
    { outcome: 'Independent lecture delivery (min. 2 full sessions)', verify: 'Faculty Lead lecture observation' },
    { outcome: 'Student awareness — knows names, cohorts, needs', verify: 'Instructor-led student walkthrough' },
    { outcome: 'End-to-end assessment creation and management', verify: 'Review of created assessment artefacts' },
    { outcome: 'Applied pedagogical frameworks in class', verify: 'Classroom observation + self-assessment' },
    { outcome: 'Active course improvement contributor', verify: 'Written proposal submitted (WS 3.5)' },
    { outcome: 'All Phase 3 worksheets submitted and reviewed', verify: 'Compendium review by Faculty Lead' },
  ],
};

function MilestonesRenderer({ worksheetId, values, label }: MilestoneRendererProps) {
  const labels = GC_MILESTONE_LABELS[worksheetId];
  if (!values || values.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Shield size={14} style={{ color: 'var(--md-primary)' }} />
        <span className="label-medium" style={{ fontSize: '0.75rem' }}>{label || 'Milestone Outcomes'}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 'var(--md-radius-pill)', fontSize: '0.65rem', fontWeight: 600,
          background: values.every(v => v === 'Met') ? '#E8F5E9' : values.some(v => v === 'Met') ? '#FFF8E1' : '#F5F5F5',
          color: values.every(v => v === 'Met') ? t.success : values.some(v => v === 'Met') ? '#F57F17' : '#9E9E9E',
        }}>
          {values.filter(v => v === 'Met').length}/{values.length} Met
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {values.map((status, i) => {
          const milestone = labels?.[i];
          const statusColor = status === 'Met' ? t.success : status === 'Partial' ? t.warning : '#9E9E9E';
          const statusBg = status === 'Met' ? '#E8F5E9' : status === 'Partial' ? '#FFF8E1' : '#F5F5F5';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: 'var(--md-radius-lg)',
              background: statusBg, border: '1px solid ' + statusColor,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: statusColor, flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 500, color: status === 'Not Met' ? 'var(--md-outline)' : 'var(--md-on-surface)' }}>
                  {milestone?.outcome || `Milestone ${i + 1}`}
                </span>
                {milestone?.verify && (
                  <p style={{ fontSize: '0.65rem', color: 'var(--md-outline)', margin: '2px 0 0', fontStyle: 'italic' }}>
                    {milestone.verify}
                  </p>
                )}
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600,
                background: statusColor, color: '#FFF', whiteSpace: 'nowrap',
              }}>{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section Layout Configuration ───────────────────────────────────────

export interface SectionLayout {
  sections: string[];
  sectionMap: Record<string, string[]>;
}

/**
 * FIELD_SECTIONS — Maps worksheet IDs to review display sections.
 * Exported for validation tests.
 */
export const FIELD_SECTIONS: Record<string, SectionLayout> = {
  p1_w1: {
    sections: ['About You', 'Stakeholders', 'Conversations', 'Buddy Assignment', 'Reflection'],
    sectionMap: {
      'About You': ['employeeName', 'department'],
      'Stakeholders': ['stakeholders'],
      'Conversations': ['conversations'],
      'Buddy Assignment': ['buddyName', 'buddyAssignmentDate', 'buddyChannel', 'buddySyncDay'],
      'Reflection': ['reflectionLearningFrom'],
    }
  },
  p1_w2: {
    sections: ['About You', 'Weekly Syncs', 'Mentor Feedback'],
    sectionMap: {
      'About You': ['employeeName', 'mentorName'],
      'Weekly Syncs': ['weeks'],
      'Mentor Feedback': ['mentorStrengths', 'mentorAreasForGrowth', 'mentorReadiness'],
    }
  },
  p1_w3: {
    sections: ['About You', 'Culture Understanding', 'University Partnership', 'Personal Commitment', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Culture Understanding': ['culturePhilosophy', 'cultureIndustryDiff', 'culturePsychSafety'],
      'University Partnership': ['partnerStructure', 'semesterStructure', 'studentExpectations'],
      'Personal Commitment': ['behaviour1', 'behaviour2', 'behaviour3'],
      'Verification': ['employeeSignature'],
    }
  },
  p1_w4: {
    sections: ['About You', 'Academic Calendar', 'Cohort Structure', 'Governance Contacts', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Academic Calendar': ['semesters'],
      'Cohort Structure': ['cohorts'],
      'Governance Contacts': ['liaisonContact', 'escalationPath', 'gradeProcess', 'latePolicy'],
      'Verification': ['employeeSignature'],
    }
  },
  p1_w5: {
    sections: ['About You', 'Student Side Exploration', 'Instructor Checklist', 'Faculty Demo', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Student Side Exploration': ['studentLog'],
      'Instructor Checklist': ['instructorTasks'],
      'Faculty Demo': ['demoDate', 'demoTasks', 'demoGaps', 'demoSignature'],
      'Verification': ['employeeSignature'],
    }
  },
  p1_w6: {
    sections: ['About You', 'Observations', 'Reflections', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Observations': ['observations'],
      'Reflections': ['reflectionArc', 'reflectionRoom', 'reflectionAdopt'],
      'Verification': ['employeeSignature'],
    }
  },
  p1_w7: {
    sections: ['About You', 'Courseware Reviews', 'Content Narrative', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Courseware Reviews': ['reviews'],
      'Content Narrative': ['narrativeAchieve', 'narrativeProgression', 'narrativeStruggle'],
      'Verification': ['employeeSignature'],
    }
  },
  p1_w8: {
    sections: ['About You', 'Slack Channel Audit', 'Bottleneck Synthesis', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Slack Channel Audit': ['channels'],
      'Bottleneck Synthesis': ['topMisconceptions', 'contentDecisions', 'highestImpact'],
      'Verification': ['employeeSignature'],
    }
  },
  p2_w1: {
    sections: ['About You', 'Doubt Resolution Log', 'Error Pattern Diagnostic', 'Key Insight', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Doubt Resolution Log': ['entries'],
      'Error Pattern Diagnostic': ['errors'],
      'Key Insight': ['keyInsight'],
      'Verification': ['employeeSignature'],
    }
  },
  p2_w2: {
    sections: ['About You', 'Lab Sessions', 'Scorecard', 'Reflection', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Lab Sessions': ['sessions'],
      'Scorecard': ['dimScores'],
      'Reflection': ['strongestMoment', 'biggestChallenge'],
      'Verification': ['employeeSignature'],
    }
  },
  p2_w3: {
    sections: ['About You', 'Content Tracker', 'Quality Checklist', 'Reflection', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Content Tracker': ['entries'],
      'Quality Checklist': ['qualityChecks'],
      'Reflection': ['reflection'],
      'Verification': ['employeeSignature'],
    }
  },
  p2_w4: {
    sections: ['About You', 'Portal Operations', 'Faculty Demo', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Portal Operations': ['tasks'],
      'Faculty Demo': ['demoDate', 'demoTasks', 'demoGaps', 'demoSignature'],
      'Verification': ['employeeSignature'],
    }
  },
  p3_w1: {
    sections: ['About You', 'Lecture Log', 'Post-Mortem', 'Faculty Debrief', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Lecture Log': ['lectures'],
      'Post-Mortem': ['postMortemFlow', 'postMortemParticipation', 'postMortemQuestions', 'postMortemTime'],
      'Faculty Debrief': ['feedbackSummary', 'improvementTarget'],
      'Verification': ['employeeSignature'],
    }
  },
  p3_w2: {
    sections: ['About You', 'Cohort Profile', 'Teaching Adaptations'],
    sectionMap: {
      'About You': ['employeeName'],
      'Cohort Profile': ['cohortSize', 'performanceRange', 'learningNeeds', 'highPerformers', 'lowPerformers'],
      'Teaching Adaptations': ['teachingAdaptations', 'relationshipApproach'],
    }
  },
  p3_w3: {
    sections: ['About You', "Bloom's Taxonomy Grid", 'Assessment Design Decisions'],
    sectionMap: {
      'About You': ['employeeName'],
      "Bloom's Taxonomy Grid": ['bloomGrid'],
      'Assessment Design Decisions': ['blueprintAssessmentType', 'blueprintDifficultyDistribution', 'blueprintFeedbackLoop'],
    }
  },
  p3_w4: {
    sections: ['About You', 'Framework Application', 'Growth as an Educator'],
    sectionMap: {
      'About You': ['employeeName'],
      'Framework Application': ['frameworksApplied', 'activeLearningExample', 'theoryPracticeGap'],
      'Growth as an Educator': ['iterationNotes', 'frameworkGrowth'],
    }
  },
  p3_w5: {
    sections: ['About You', 'Problem Identification', 'Proposed Improvement', 'Implementation & Success Metrics'],
    sectionMap: {
      'About You': ['employeeName'],
      'Problem Identification': ['problemIdentified'],
      'Proposed Improvement': ['proposedChange', 'expectedImpact'],
      'Implementation & Success Metrics': ['implementationPlan', 'successCriteria'],
    }
  },

  // ─── FTP Week 1 — Anchor ────────────────────────────
  w1_o1: {
    sections: ['About You', 'Access Verification', 'Buddy & Comms', 'Logistics Checklist'],
    sectionMap: {
      'About You': ['employeeName'],
      'Access Verification': ['accessLog'],
      'Buddy & Comms': ['buddyConfirmed', 'commsChannelsJoined'],
      'Logistics Checklist': ['logisticsComplete'],
    }
  },
  w1_e1: {
    sections: ['About You', 'Pre-read Completion', 'Reflection'],
    sectionMap: {
      'About You': ['employeeName'],
      'Pre-read Completion': ['v3Verified'],
      'Reflection': ['contestReflection'],
    }
  },
  w1_o2: {
    sections: ['About You', 'Scavenger Sheet', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Scavenger Sheet': ['scavengerAnswers', 'playbookFluency'],
      'Verification': ['employeeSignature'],
    }
  },

  // ─── FTP Week 2 — Co-create ─────────────────────────
  w2_e1: {
    sections: ['About You', 'Session Verification', 'Blooms Tagging', 'Reflection'],
    sectionMap: {
      'About You': ['employeeName'],
      'Session Verification': ['sessionAttended'],
      'Blooms Tagging': ['taggingSheet', 'taggingInsights'],
      'Reflection': ['bloomsReflection'],
    }
  },
  w2_c3: {
    sections: ['About You', 'Question Set', 'Peer Review', 'Course Lead Feedback'],
    sectionMap: {
      'About You': ['employeeName'],
      'Question Set': ['mcqCreated', 'codingCreated', 'questionQuality'],
      'Peer Review': ['peerReviewed', 'peerReviewer', 'peerFeedbackGiven'],
      'Course Lead Feedback': ['courseLeadFeedback', 'revisionApplied'],
    }
  },
  w2_d2: {
    sections: ['About You', 'Micro-Teach Session', 'Peer Feedback', 'Self Reflection'],
    sectionMap: {
      'About You': ['employeeName'],
      'Micro-Teach Session': ['microTeachDate', 'segmentTopic', 'peerAudience'],
      'Peer Feedback': ['rubricLiteScores', 'peerFeedbackSummary'],
      'Self Reflection': ['microTeachReflection', 'improvementFocus'],
    }
  },
  w2_b1: {
    sections: ['About You', 'Discipline Session', 'Customisation Sheet', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Discipline Session': ['disciplineKeyTakeaways', 'mirrorMoment'],
      'Customisation Sheet': ['customisationDraft', 'customisationRules'],
      'Verification': ['employeeSignature'],
    }
  },
  w2_o1: {
    sections: ['About You', 'Invigilation Training', 'Scenario Exercise', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Invigilation Training': ['invigilationPolicyReviewed'],
      'Scenario Exercise': ['scenarioSheet', 'scenarioReflection'],
      'Verification': ['employeeSignature'],
    }
  },

  // ─── FTP Week 3 — Co-deliver ────────────────────────
  w3_d1: {
    sections: ['About You', 'Tech Proficiency', 'Hands-On Check', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Tech Proficiency': ['projectorTested', 'pentabTested', 'portalJoined', 'recordingTested'],
      'Hands-On Check': ['techConfidence', 'techGaps'],
      'Verification': ['employeeSignature'],
    }
  },
  w3_d2: {
    sections: ['About You', 'Planning Exercise', 'Time Management'],
    sectionMap: {
      'About You': ['employeeName'],
      'Planning Exercise': ['tenMinPlan', 'pacingStrategy'],
      'Time Management': ['transitionPlan', 'timeboxApproach'],
    }
  },
  w3_e1: {
    sections: ['About You', 'Mini-Contest Design', 'Bloom Distribution', 'Peer Review'],
    sectionMap: {
      'About You': ['employeeName'],
      'Mini-Contest Design': ['contestTitle', 'questions'],
      'Bloom Distribution': ['bloomBalance', 'difficultyMix'],
      'Peer Review': ['peerReviewer', 'peerFeedback', 'revisionsApplied'],
    }
  },
  w3_b1: {
    sections: ['About You', 'Dialoguing Exercise', 'Reflection'],
    sectionMap: {
      'About You': ['employeeName'],
      'Dialoguing Exercise': ['atRiskRoleplay', 'challengedRuleRoleplay', 'basicQuestionRoleplay'],
      'Reflection': ['dialoguingReflection', 'witnessedCommitment'],
    }
  },

  // ─── FTP Week 1 Gate — Anchor Artifact Review ──────
  w1_g1: {
    sections: ['About You', 'Required Artifacts', 'Notes'],
    sectionMap: {
      'About You': ['employeeName'],
      'Required Artifacts': ['artifacts'],
      'Notes': ['buddyNotes'],
    }
  },

  // ─── FTP Week 2 Gate — Co-create Artifact Review ────
  w2_g1: {
    sections: ['About You', 'Required Artifacts', 'Notes'],
    sectionMap: {
      'About You': ['employeeName'],
      'Required Artifacts': ['artifacts'],
      'Notes': ['buddyNotes'],
    }
  },

  // ─── FTP Week 3 Gate — Co-deliver Artifact Review ────
  w3_g1: {
    sections: ['About You', 'Required Artifacts', 'Notes'],
    sectionMap: {
      'About You': ['employeeName'],
      'Required Artifacts': ['artifacts'],
      'Notes': ['buddyNotes'],
    }
  },

  // ─── FTP Week 4 Gate — Independence Artifact Review ──
  w4_g1: {
    sections: ['About You', 'Required Artifacts', 'Notes'],
    sectionMap: {
      'About You': ['employeeName'],
      'Required Artifacts': ['artifacts'],
      'Notes': ['buddyNotes'],
    }
  },

  // ─── FTP Week 4 — Independence ──────────────────────
  w4_d2: {
    sections: ['About You', 'Mock/Live Session', 'Edge Case Scenarios', 'Observer Notes'],
    sectionMap: {
      'About You': ['employeeName'],
      'Mock/Live Session': ['sessionType', 'sessionDate', 'coTeachPartner'],
      'Edge Case Scenarios': ['lateArrival', 'phoneIncident', 'basicQuestion'],
      'Observer Notes': ['observerFeedback', 'improvementAreas'],
    }
  },
  w4_e1: {
    sections: ['About You', 'Analysis Dataset', 'Predictions vs Actuals', 'Calibration Note'],
    sectionMap: {
      'About You': ['employeeName'],
      'Analysis Dataset': ['contestDatasetIdentified', 'solveRatesPredicted'],
      'Predictions vs Actuals': ['actualSolveRates', 'calibrationAnalysis'],
      'Calibration Note': ['calibrationNote'],
    }
  },
  w4_o1: {
    sections: ['About You', 'Pre-Semester Checklist', 'Course Lead Sign-off'],
    sectionMap: {
      'About You': ['employeeName'],
      'Pre-Semester Checklist': ['checklistItems'],
      'Course Lead Sign-off': ['courseLeadSignOff', 'checklistNotes'],
    }
  },
  w4_b1: {
    sections: ['About You', 'Reflection Cycle', 'Commitment Ceremony', 'Sign-off'],
    sectionMap: {
      'About You': ['employeeName'],
      'Reflection Cycle': ['reflectionOne', 'reflectionGrowth'],
      'Commitment Ceremony': ['firstSemesterCommitment'],
      'Sign-off': ['employeeSignature', 'facilitatorSignature'],
    }
  },

  // ─── Gate Controls ──────────────────────────────────
  gc1: {
    sections: ['About You', 'Self Assessment', 'Milestone Outcomes', 'Manager Assessment', 'Sign-Off'],
    sectionMap: {
      'About You': ['employeeName'],
      'Self Assessment': ['portalRating', 'courseRating', 'studentRating', 'commRating', 'readinessRating'],
      'Milestone Outcomes': ['milestones'],
      'Manager Assessment': ['managerStrengths', 'managerRisks', 'readinessDecision'],
      'Sign-Off': ['managerSignature', 'instructorSignature'],
    }
  },
  gc2: {
    sections: ['About You', 'Self Assessment', 'Milestone Outcomes', 'Manager Review', 'Sign-Off'],
    sectionMap: {
      'About You': ['employeeName'],
      'Self Assessment': ['studentSupport', 'labFacilitation', 'contentCreation', 'portalProficiency', 'communication'],
      'Milestone Outcomes': ['milestones'],
      'Manager Review': ['managerComments', 'decision'],
      'Sign-Off': ['managerSignature', 'instructorSignature'],
    }
  },
  gc3: {
    sections: ['About You', 'Self Reflection', 'Faculty Assessment', 'Milestone Outcomes', 'Final Decision', 'Sign-Off'],
    sectionMap: {
      'About You': ['employeeName'],
      'Self Reflection': ['selfProud', 'selfUncomfortable', 'selfSkills', 'selfPhilosophy'],
      'Faculty Assessment': ['teachingRating', 'commRating', 'contentRating', 'studentRating', 'assessmentRating', 'ownershipRating', 'professionalismRating'],
      'Milestone Outcomes': ['milestones'],
      'Final Decision': ['decision', 'finalComments'],
      'Sign-Off': ['facultyLeadSignature', 'instructorSignature'],
    }
  },
};

function getSectionLayout(worksheetId: string): SectionLayout | null {
  return FIELD_SECTIONS[worksheetId] || null;
}

function getArrayHeaders(key: string): string[] | null {
  const headerMap: Record<string, string[]> = {
    stakeholders: ['name', 'role', 'team', 'responsibility'],
    conversations: ['instructorName', 'date', 'takeaways'],
    weeks: ['date', 'topics', 'actions', 'mentorSignoff'],
    semesters: ['semester', 'startDate', 'endDate', 'keyEvents'],
    cohorts: ['name', 'students', 'semesterYear', 'notes'],
    observations: ['date', 'subject', 'instructor', 'sessionType', 'observations'],
    reviews: ['subject', 'items', 'quality', 'gaps'],
    channels: ['channel', 'dateRange', 'themes', 'pastDecisions'],
    entries: ['date', 'channel', 'query', 'resolution'],
    errors: ['misconception', 'topic', 'rootCause', 'fix'],
    sessions: ['date', 'subject', 'observer', 'notes'],
    lectures: ['date', 'subject', 'duration', 'observer'],
    students: ['name', 'cohort', 'category', 'notes'],
    assessments: ['title', 'type', 'questions', 'date', 'tested', 'approved'],
    frameworks: ['applied', 'outcome', 'effectiveness'],
    bloomsGrid: ['example', 'count', 'percent'],
    studentLog: ['date', 'friction'],
    instructorTasks: ['selfAssessed', 'verified'],
    tasks: ['self', 'verified'],
  };
  return headerMap[key] || null;
}

function getScoreLabels(key: string): string[] | null {
  const labelMap: Record<string, string[]> = {
    dimScores: ['Explained problem statement clearly', 'Circulated and helped multiple students', 'Debugged without giving answers', 'Managed 90-min lab time', 'Maintained student engagement'],
  };
  return labelMap[key] || null;
}

// ─── Main Exported Component ────────────────────────────────────────────

export default function ReviewContent({ data, worksheetId }: ReviewContentProps) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="body-medium text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No content submitted yet.</p>;
  }

  const layout = getSectionLayout(worksheetId);

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__reviewWorksheetId = worksheetId;
  }

  if (import.meta.env.DEV && layout) {
    const allLayoutFields = new Set(Object.values(layout.sectionMap).flat());
    const dataKeys = Object.keys(data).filter(k => !k.startsWith('_') && k !== 'status' && k !== 'dateSubmitted' && k !== '__reviewWorksheetId');
    const missingFields = dataKeys.filter(k => !allLayoutFields.has(k) && typeof data[k] !== 'object');
    if (missingFields.length > 0) {
      console.warn(
        `[ReviewContent] FIELD_SECTIONS drift for ${worksheetId}: ` +
        `These fields exist in submitted data but are missing from the layout config: ` +
        missingFields.join(', ') +
        `. Update FIELD_SECTIONS in ReviewContent.tsx to include them.`
      );
    }
  }

  if (layout) {
    return renderWithLayout(data, layout);
  }

  return renderGeneric(data);
}

function renderWithLayout(data: Record<string, unknown>, layout: SectionLayout): React.ReactNode {
  const renderedSections = layout.sections.map((sectionTitle) => {
    const fields = layout.sectionMap[sectionTitle];
    if (!fields) return null;

    const relevantEntries = fields.filter(key => {
      const val = data[key];
      if (shouldSkip(key)) return false;
      if (val === undefined || val === null) return false;
      if (typeof val === 'string' && !val.trim()) return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    });

    if (relevantEntries.length === 0) return null;

    return (
      <div key={sectionTitle} className="review-section" style={{
        padding: '1rem 1.25rem',
        borderRadius: 'var(--md-radius-xl)',
        background: 'var(--md-surface)',
        border: '1px solid var(--md-outline-variant)',
      }}>
        <h4 className="title-small" style={{
          marginBottom: '0.75rem', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '8px',
          color: 'var(--md-primary)',
        }}>
          <FileText size={14} />
          {sectionTitle}
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {relevantEntries.map(key => renderField(key, data[key]))}
        </div>
      </div>
    );
  });

  const hasContent = renderedSections.some(s => s !== null);
  if (!hasContent) {
    return (
      <p className="body-medium text-muted" style={{ textAlign: 'center', padding: '1.5rem 0', fontStyle: 'italic', color: 'var(--md-outline)' }}>
        No submitted content to display.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {renderedSections}
    </div>
  );
}

function renderGeneric(data: Record<string, unknown>): React.ReactNode {
  const entries = Object.entries(data).filter(([key]) => !shouldSkip(key) && data[key] !== undefined && data[key] !== null);
  if (entries.length === 0) {
    return <p className="body-medium text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No content submitted yet.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '1rem 1.25rem', borderRadius: 'var(--md-radius-xl)',
        background: 'var(--md-surface)', border: '1px solid var(--md-outline-variant)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {entries.map(([key]) => renderField(key, data[key]))}
        </div>
      </div>
    </div>
  );
}

function renderField(key: string, value: unknown): React.ReactNode {
  if (isSignature(key) && value && typeof value === 'string') {
    return (
      <div key={key} className="review-field">
        <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          {toLabel(key)}
        </span>
        <SignatureBadge value={value} />
      </div>
    );
  }

  // Arrays of objects → Table
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
    const headers = getArrayHeaders(key);
    if (headers) {
      return (
        <div key={key} className="review-field">
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {toLabel(key)}
          </span>
          <TableRenderer data={value as Record<string, unknown>[]} headers={headers} />
        </div>
      );
    }
  }

  // Gate control milestone string arrays
  if (key === 'milestones' && Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    const wid = typeof window !== 'undefined' ? (window as unknown as Record<string, string>).__reviewWorksheetId : '';
    return (
      <div key={key} className="review-field">
        <MilestonesRenderer worksheetId={wid || ''} values={value as string[]} label="Milestone Outcomes" />
      </div>
    );
  }

  // Score grids (dimScores)
  if (key === 'dimScores' && Array.isArray(value)) {
    const labels = getScoreLabels(key);
    return (
      <div key={key} className="review-field">
        <ScoreGridRenderer scores={value as number[][]} labels={labels} />
      </div>
    );
  }

  // Boolean arrays (qualityChecks, etc.)
  if (Array.isArray(value) && value.every(v => typeof v === 'boolean')) {
    return (
      <div key={key} className="review-field">
        <ChecklistRenderer items={value as boolean[]} label={toLabel(key)} />
      </div>
    );
  }

  // Tasks arrays (objects with self/verified booleans)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    const sampleKeys = Object.keys(value[0] as Record<string, unknown>);
    const allBooleans = sampleKeys.every(k => k === 'self' || k === 'verified' || k === 'selfAssessed' || k === 'submitted' || k === 'approved' || k === 'tested');
    if (allBooleans && sampleKeys.every(k => typeof (value[0] as Record<string, unknown>)[k] === 'boolean')) {
      return (
        <div key={key} className="review-field">
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {toLabel(key)}
          </span>
          {renderBooleansList(value as Record<string, boolean>[], sampleKeys)}
        </div>
      );
    }
    const headers = getArrayHeaders(key);
    if (headers) {
      return (
        <div key={key} className="review-field">
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {toLabel(key)}
          </span>
          <TableRenderer data={value as Record<string, unknown>[]} headers={headers} />
        </div>
      );
    }
    return null;
  }

  // Simple values
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (!value && value !== 0 && typeof value !== 'boolean') return null;
    return isDateField(key)
      ? (
        <div key={key} className="review-field" style={{ marginBottom: '0.5rem' }}>
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
            {toLabel(key)}
          </span>
          <DateBadge value={String(value)} />
        </div>
      )
      : <StringField key={key} keyProp={key} value={value} />;
  }

  return null;
}

function renderBooleansList(items: Record<string, boolean>[], keys: string[]): React.ReactNode {
  const taskLabels: Record<string, string[]> = {
    p1_w5: ['Browse course dashboard', 'View & attempt assignment', 'Submit code in contest', 'View grades & feedback', 'Navigate lab interface', 'Access lecture schedule'],
    p2_w3: ['Unambiguous problem statements', 'Complete test cases included', 'Plausible MCQs', 'Answer keys included', 'Appropriate difficulty', 'Reviewed by mentor'],
    p2_w4: ['Create coding question', 'Create MCQ', 'Create subjective question', 'Create fill-in-blank', 'Design assignment', 'Set lab exercise', 'Configure quiz', 'Set content release rules', 'View student reports', 'Reopen deadlines'],
  };

  const labels = taskLabels[Object.keys(taskLabels).find(k => {
    const taskLen = taskLabels[k as keyof typeof taskLabels];
    return taskLen !== undefined && items.length === taskLen.length;
  }) || ''] || null;

  return (
    <div style={{ display: 'grid', gap: '4px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: 'var(--md-radius-lg)',
          background: 'var(--md-surface-variant)20', border: '1px solid var(--md-outline-variant)',
          fontSize: '0.75rem',
        }}>
          <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
            {keys.map(k => (
              <span key={k} style={{
                padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600,
                background: item[k] ? '#E8F5E9' : '#F5F5F5',
                color: item[k] ? t.success : '#9E9E9E',
              }}>
                {k === 'self' || k === 'selfAssessed' ? 'S' : k === 'verified' ? 'V' : k === 'submitted' ? 'Sub' : k === 'approved' ? 'App' : k === 'tested' ? 'Test' : k}
              </span>
            ))}
          </div>
          {labels && <span style={{ color: 'var(--md-on-surface)' }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}
