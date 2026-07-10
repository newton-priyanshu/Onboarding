require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials in .env');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
  console.error('Optional for full access: VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main() {
  const email = 'admin_test@test.com';
  const password = 'Test123!';
  const fullName = 'Test Admin';
  const role = 'onboarding_lead';

  // Step 1: Sign up
  console.log('Signing up...');
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      data: { full_name: fullName, role },
    }),
  });
  const signupData = await signupRes.json();
  console.log('Signup status:', signupRes.status);
  console.log('Signup response:', JSON.stringify(signupData, null, 2));

  if (!signupData.id) {
    console.error('Signup failed - no user ID returned');
    process.exit(1);
  }

  // Step 2: Insert profile
  console.log('\nCreating profile...');
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      id: signupData.id,
      email,
      full_name: fullName,
      role,
    }),
  });
  const profileText = await profileRes.text();
  console.log('Profile response status:', profileRes.status);
  console.log('Profile response:', profileText);

  if (profileRes.ok) {
    console.log('\n✅ Admin user created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role: ${role}`);
  } else {
    console.log('\n⚠️  Profile creation had an issue, but auth user was created.');
    console.log('You can try signing in - the app may auto-create the profile.');
  }
}

main().catch(console.error);
