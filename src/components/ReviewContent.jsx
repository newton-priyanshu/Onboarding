import { CheckCircle2, XCircle, Star, Calendar, FileText, ClipboardCheck, Signature } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function toLabel(str) {
  if (!str) return '';
  // Handle camelCase and lowercase with underscores
  const label = str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
  // Override common keys with friendly labels
  const overrides = {
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
    'Lead Signature': 'Faculty Lead Signature',
    'Self Natural': 'Most Natural Framework',
    'Self Effort': 'Requires Most Effort',
    'Self Moment': 'Proud Moment',
  };
  return overrides[label] || label;
}

function isSignature(key) {
  const k = key.toLowerCase();
  return k.includes('signature');
}

function isDateField(key) {
  const k = key.toLowerCase();
  return k === 'date' || k === 'startdate' || k === 'enddate' || k === 'demoDate'
    || k === 'datedemo' || k === 'dateknownames' || k === 'buddyassignmentdate'
    || k === 'datesubmitted' || k === 'datesubmittedmeta';
}

function shouldSkip(key) {
  if (key.startsWith('_')) return true;
  const skipFields = ['status', 'datesubmitted', 'datesubmittedmeta'];
  return skipFields.includes(key.toLowerCase());
}

function isBooleanField(key) {
  const k = key.toLowerCase();
  const booleans = ['mentorsignoff', 'selfassessed', 'verified', 'submitted', 'approved', 'tested', 'self'];
  return booleans.includes(k);
}

// ─── Sub-renderers ──────────────────────────────────────────────────────────

function renderValue(value, key) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') {
    return value
      ? <span style={{ color: '#1B5E20', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Yes</span>
      : <span style={{ color: '#9E9E9E', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><XCircle size={14} /> No</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ fontWeight: 600, color: 'var(--md-primary)' }}>{value}</span>;
  }
  return String(value);
}

function SignatureBadge({ value }) {
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

function DateBadge({ value }) {
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

function StringField({ keyProp, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="review-field" style={{ marginBottom: '0.5rem' }}>
      <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
        {toLabel(keyProp)}
      </span>
      <span className="body-medium" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--md-on-surface)' }}>
        {value}
      </span>
    </div>
  );
}

function TableRenderer({ data, headers }) {
  if (!data || data.length === 0) return <p className="body-small text-muted" style={{ fontStyle: 'italic' }}>No entries</p>;

  // Filter out empty rows (all values empty/null)
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
                      ? <DateBadge value={row[h]} />
                      : row[h] || <span className="text-muted" style={{ fontStyle: 'italic', opacity: 0.5 }}>-</span>
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

function ChecklistRenderer({ items, label }) {
  const checked = items.filter(Boolean).length;
  const total = items.length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <ClipboardCheck size={14} style={{ color: 'var(--md-primary)' }} />
        <span className="label-medium" style={{ fontSize: '0.75rem' }}>{label || 'Checklist'}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 'var(--md-radius-pill)', fontSize: '0.65rem', fontWeight: 600,
          background: checked === total ? '#E8F5E9' : '#FFF8E1', color: checked === total ? '#1B5E20' : '#F57F17',
        }}>{checked}/{total}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((checked, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
            borderRadius: 'var(--md-radius-sm)',
            color: checked ? 'var(--md-on-surface)' : 'var(--md-outline)',
          }}>
            {checked
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

function ScoreGridRenderer({ scores, labels }) {
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
                color: score >= 4 ? '#1B5E20' : score >= 3 ? '#F57F17' : '#C62828',
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
// ─── Main Exported Component ────────────────────────────────────────────────

const FIELD_SECTIONS = {
  // Phase 1 Worksheet 1
  p1_w1: {
    sections: ['About You', 'Stakeholders', 'Conversations', 'Buddy Assignment', 'Reflection'],
    sectionMap: {
      'About You': ['employeeName', 'department', 'mentorName', 'mentorEmail'],
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
      'Reflections': ['reflectionArc', 'reflectionRoom', 'reflectionDoubts', 'reflectionLabDiff', 'reflectionAdopt'],
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
    sections: ['About You', 'Cohort Overview', 'Student Profiles', 'Reflection', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Cohort Overview': ['totalStudents', 'cohortNames', 'subjects', 'dateKnowNames'],
      'Student Profiles': ['students'],
      'Reflection': ['supportStruggling', 'utilizeHighPerformers'],
      'Verification': ['employeeSignature'],
    }
  },
  p3_w3: {
    sections: ['About You', 'Assessment Registry', "Bloom's Taxonomy", 'Difficulty Balance', 'Reflection', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Assessment Registry': ['assessments'],
      "Bloom's Taxonomy": ['bloomsGrid'],
      'Difficulty Balance': ['easyActual', 'mediumActual', 'hardActual'],
      'Reflection': ['reflection'],
      'Verification': ['employeeSignature'],
    }
  },
  p3_w4: {
    sections: ['About You', 'Framework Application', 'Self-Assessment', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Framework Application': ['frameworks'],
      'Self-Assessment': ['selfNatural', 'selfEffort', 'selfMoment'],
      'Verification': ['employeeSignature'],
    }
  },
  p3_w5: {
    sections: ['About You', 'Proposal', 'Problem & Solution', 'Faculty Review', 'Verification'],
    sectionMap: {
      'About You': ['employeeName'],
      'Proposal': ['proposalTitle', 'areaOfImprovement', 'subjectAffected', 'dateSubmitted'],
      'Problem & Solution': ['problemStatement', 'evidence', 'proposedSolution', 'expectedImpact', 'implementationEffort'],
      'Faculty Review': ['leadDecision', 'leadComments', 'leadTimeline', 'leadSignature'],
      'Verification': ['employeeSignature'],
    }
  },
};

// Default section layout for unknown worksheets
function getSectionLayout(worksheetId) {
  return FIELD_SECTIONS[worksheetId] || null;
}

function getArrayHeaders(key) {
  const headerMap = {
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
    // For items with object + boolean array combo
    studentLog: ['date', 'friction'],
    instructorTasks: ['selfAssessed', 'verified'],
    tasks: ['self', 'verified'],
  };
  return headerMap[key] || null;
}

function getScoreLabels(key) {
  const labelMap = {
    dimScores: ['Explained problem statement clearly', 'Circulated and helped multiple students', 'Debugged without giving answers', 'Managed 90-min lab time', 'Maintained student engagement'],
  };
  return labelMap[key] || null;
}

export default function ReviewContent({ data, worksheetId }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="body-medium text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No content submitted yet.</p>;
  }

  // For simple worksheets without specific section layouts, do a generic render
  const layout = getSectionLayout(worksheetId);
  if (layout) {
    return renderWithLayout(data, layout);
  }

  return renderGeneric(data);
}

function renderWithLayout(data, layout) {
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

function renderGeneric(data) {
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

function renderField(key, value) {
  // Skip empty booleans (false is valid, show it)
  // Signatures
  if (isSignature(key) && value) {
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
          <TableRenderer data={value} headers={headers} />
        </div>
      );
    }
  }

  // Score grids (dimScores)
  if (key === 'dimScores' && Array.isArray(value)) {
    const labels = getScoreLabels(key);
    return (
      <div key={key} className="review-field">
        <ScoreGridRenderer scores={value} labels={labels} />
      </div>
    );
  }

  // Boolean arrays (qualityChecks, etc.)
  if (Array.isArray(value) && value.every(v => typeof v === 'boolean')) {
    return (
      <div key={key} className="review-field">
        <ChecklistRenderer items={value} label={toLabel(key)} />
      </div>
    );
  }

  // Tasks arrays (objects with self/verified booleans)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    const sampleKeys = Object.keys(value[0]);
    const allBooleans = sampleKeys.every(k => k === 'self' || k === 'verified' || k === 'selfAssessed' || k === 'verified' || k === 'submitted' || k === 'approved' || k === 'tested');
    if (allBooleans && sampleKeys.every(k => typeof value[0][k] === 'boolean' || value[0][k] === true || value[0][k] === false)) {
      // Render as paired checklist
      return (
        <div key={key} className="review-field">
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {toLabel(key)}
          </span>
          {renderBooleansList(value, sampleKeys)}
        </div>
      );
    }
    // Otherwise try table
    const headers = getArrayHeaders(key);
    if (headers) {
      return (
        <div key={key} className="review-field">
          <span className="label-medium" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--md-outline)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {toLabel(key)}
          </span>
          <TableRenderer data={value} headers={headers} />
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
          <DateBadge value={value} />
        </div>
      )
      : <StringField key={key} keyProp={key} value={value} />;
  }

  return null;
}

function renderBooleansList(items, keys) {
  const taskLabels = {
    p1_w5: ['Browse course dashboard', 'View & attempt assignment', 'Submit code in contest', 'View grades & feedback', 'Navigate lab interface', 'Access lecture schedule'],
    p2_w3: ['Unambiguous problem statements', 'Complete test cases included', 'Plausible MCQs', 'Answer keys included', 'Appropriate difficulty', 'Reviewed by mentor'],
    p2_w4: ['Create coding question', 'Create MCQ', 'Create subjective question', 'Create fill-in-blank', 'Design assignment', 'Set lab exercise', 'Configure quiz', 'Set content release rules', 'View student reports', 'Reopen deadlines'],
  };

  const labels = taskLabels[Object.keys(taskLabels).find(k => items.length === taskLabels[k].length)] || null;

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
                color: item[k] ? '#1B5E20' : '#9E9E9E',
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
