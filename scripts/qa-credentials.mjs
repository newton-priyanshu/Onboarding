// =============================================================================
// QA Credentials Reference — single source of truth (BUG-4)
// =============================================================================
// Prints the email/password matrix for every QA/test role so testers never
// have to guess a password. Every seed script uses the SAME password: Test123!
//
// Usage:
//   node scripts/qa-credentials.mjs
//
// Password convention (BUG-4 fix): ALL test accounts use `Test123!`.
// If you create a new seed script, use `const PASSWORD = 'Test123!'`.
// =============================================================================

const PASSWORD = 'Test123!';

// Accounts that pre-date the standardization but are kept for convenience.
// Password for each is Test123! (rotate existing live accounts with the
// service role key — new seed-created accounts already use Test123!).
// NOTE: some may not be provisioned in every environment (created on demand);
// treat this list as the canonical naming, not a guarantee of existence.
const FIXED_ACCOUNTS = [
  { role: 'super_admin',      email: 'superadmin@newtonschool.co',     name: 'Platform Super Admin' },
  { role: 'campus_head',      email: 'campus.head@newtonschool.co',    name: 'Campus Head' },
  { role: 'progression_head', email: 'progression.head@newtonschool.co', name: 'Progression Head' },
  { role: 'ops_head',         email: 'ops.head@newtonschool.co',       name: 'Ops Head' },
  { role: 'academic_head',    email: 'manager@newton.edu',             name: 'Academic Head / Manager' },
  { role: 'onboarding_lead',  email: 'onboarding.lead@newton.edu',     name: 'Onboarding Lead' },
  { role: 'lead_instructor',  email: 'buddy@newton.edu',               name: 'Buddy / Mentor' },
];

// Suffixed accounts created on demand by the seed scripts
// (scripts/create-test-users.mjs, scripts/create-10-role-users.mjs,
//  scripts/create-buddy-users.mjs). Look up the run output for exact emails;
// password is always Test123!.
const SUFFIXED_TEMPLATES = [
  { role: 'new_joinee',       pattern: 'joinee_{TS}@newton.edu' },
  { role: 'lab_instructor',   pattern: 'labinstr_{TS}@newton.edu' },
  { role: 'lead_instructor',  pattern: 'buddy_{TS}@newton.edu' },
  { role: 'academic_head',    pattern: 'manager_{TS}@newton.edu' },
  { role: 'onboarding_lead',  pattern: 'onboard_{TS}@newton.edu' },
  { role: 'acad_ops',         pattern: 'acadops_{TS}@newton.edu' },
  { role: 'campus_head',      pattern: 'e2e.campushead_{TS}@newton.edu' },
  { role: 'campus_admin',     pattern: 'e2e.campusadmin_{TS}@newton.edu' },
  { role: 'progression_head', pattern: 'e2e.progressionhead_{TS}@newton.edu' },
  { role: 'ops_head',         pattern: 'e2e.opshead_{TS}@newton.edu' },
  { role: 'super_admin',      pattern: 'e2e.superadmin_{TS}@newton.edu' },
  { role: 'onboarding_lead',  pattern: 'e2e.onboardinglead_{TS}@newton.edu' },
  { role: 'lead_instructor',  pattern: 'e2e.buddy_{TS}@newton.edu' },
  { role: 'lab_instructor',   pattern: 'e2e.labinstructor_{TS}@newton.edu' },
  { role: 'new_joinee',       pattern: 'e2e.joinee_{TS}@newton.edu' },
];

console.log('═══════════════════════════════════════════════════════');
console.log('  QA CREDENTIALS — password for ALL accounts: Test123!');
console.log('═══════════════════════════════════════════════════════\n');

console.log('FIXED ACCOUNTS (created once, reused across runs):');
console.log('──────────────────────────────────────────────────────');
console.log(' Role                 │ Email                             │ Password');
console.log('──────────────────────┼──────────────────────────────────┼──────────');
for (const a of FIXED_ACCOUNTS) {
  console.log(` ${a.role.padEnd(20)}│ ${a.email.padEnd(32)}│ ${PASSWORD}`);
}

console.log('\nON-DEMAND ACCOUNTS (TS = per-run suffix; see seed run output):');
console.log('──────────────────────────────────────────────────────────────────');
console.log(' Role                 │ Email pattern');
console.log('──────────────────────┼────────────────────────────────────────────');
for (const a of SUFFIXED_TEMPLATES) {
  console.log(` ${a.role.padEnd(20)}│ ${a.pattern}`);
}

console.log('\n──────────────────────────────────────────────────────');
console.log('  Seeder scripts (all use Test123!):');
console.log('    scripts/create-test-users.mjs');
console.log('    scripts/create-10-role-users.mjs');
console.log('    scripts/create-buddy-users.mjs');
console.log('    scripts/create-super-admin.mjs');
console.log('    scripts/clean_setup.mjs');
console.log('    scripts/__seed_30_users.cjs');
console.log('──────────────────────────────────────────────────────\n');
