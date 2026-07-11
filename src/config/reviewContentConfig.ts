// =====================================================
// reviewContentConfig.ts — Review section layouts, headers,
// score labels, and milestone definitions.
//
// Extracted from ReviewContent.tsx so the component file
// is ~350 lines instead of ~1000. Keeps pure data/config
// separate from rendering logic.
// =====================================================

// ─── Types ──────────────────────────────────────────────

export interface SectionLayout {
  sections: string[];
  sectionMap: Record<string, string[]>;
}

export interface MilestoneLabel {
  outcome: string;
  verify: string;
}

// ─── Section Layout Configuration ───────────────────────

/**
 * FIELD_SECTIONS — Maps worksheet IDs to review display sections.
 */
export const FIELD_SECTIONS: Record<string, SectionLayout> = {
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

// ─── Helpers ────────────────────────────────────────────

export function getSectionLayout(worksheetId: string): SectionLayout | null {
  return FIELD_SECTIONS[worksheetId] || null;
}

export function getArrayHeaders(key: string): string[] | null {
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

export function getScoreLabels(key: string): string[] | null {
  const labelMap: Record<string, string[]> = {
    dimScores: ['Explained problem statement clearly', 'Circulated and helped multiple students', 'Debugged without giving answers', 'Managed 90-min lab time', 'Maintained student engagement'],
  };
  return labelMap[key] || null;
}

// ─── Gate Control Milestone Labels ─────────────────────

export const GC_MILESTONE_LABELS: Record<string, MilestoneLabel[]> = {
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
