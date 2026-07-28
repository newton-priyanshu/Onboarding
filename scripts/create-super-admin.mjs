// =============================================================================
// Create Super Admin Test User
// =============================================================================
// Creates a super_admin user with full platform access.
//
// Usage:
//   VITE_SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/create-super-admin.mjs
//
// Or add to .env:
//   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
//   VITE_SUPABASE_SERVICE_ROLE_KEY (to override trigger-assigned 'new_joinee' role)
// =============================================================================

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';


const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
config({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

// ─── Config ─────────────────────────────────────────────

const SUPER_ADMIN = {
  email: 'superadmin@newtonschool.co',
  password: 'SuperAdmin123!',
  fullName: 'Platform Super Admin',
};

// ─── Helpers ────────────────────────────────────────────

async function supabasePost(path, body, keyOverride) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': keyOverride || SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${keyOverride || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function supabasePatch(path, body, keyOverride) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': keyOverride || SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${keyOverride || SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function supabaseGet(path, keyOverride) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'apikey': keyOverride || SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${keyOverride || SUPABASE_ANON_KEY}`,
    },
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Creating Super Admin Test User');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (SERVICE_KEY) {
    console.log('  🔑 Service-role key detected — can override role\n');
  } else {
    console.log('  ⚠ No service-role key — will print SQL to run manually\n');
  }

  // Step 1: Sign up via Supabase Auth
  console.log(`📋 Step 1: Creating auth user ${SUPER_ADMIN.email}...`);
  const { status, ok, data } = await supabasePost('/auth/v1/signup', {
    email: SUPER_ADMIN.email,
    password: SUPER_ADMIN.password,
    data: { full_name: SUPER_ADMIN.fullName },
  });

  let userId = data?.id;

  if (status === 200 && userId) {
    console.log(`  ✅ Auth user created: ${userId}`);
  } else if (data?.msg?.includes('already exists') || data?.message?.includes('already registered')) {
    console.log('  ⚠ User already exists. Looking up ID...');
  } else {
    console.log(`  ⚠ Signup response (${status}):`, JSON.stringify(data).substring(0, 200));
    console.log('  Trying to find existing user...');
  }

  // Step 2: If we don't have the user ID, fetch it
  if (!userId) {
    const { data: profiles } = await supabaseGet(
      `/rest/v1/user_profiles?email=eq.${encodeURIComponent(SUPER_ADMIN.email)}&select=id`,
      SERVICE_KEY || SUPABASE_ANON_KEY
    );

    if (Array.isArray(profiles) && profiles.length > 0) {
      userId = profiles[0].id;
      console.log(`  ✅ Found existing user: ${userId}`);
    } else {
      console.error('  ❌ Could not find the user in user_profiles.');
      console.error('  Make sure the user has signed up and the handle_new_user trigger ran.');
      console.error('');
      console.error('  To create the user manually, go to:');
      console.error('  Supabase Dashboard → Authentication → Users → Invite user');
      console.error(`  Email: ${SUPER_ADMIN.email}`);
      process.exit(1);
    }
  }

  // Step 3: Update role to super_admin
  console.log(`\n📋 Step 2: Setting role to 'super_admin'...`);

  if (SERVICE_KEY) {
    const { ok: updateOk, data: updateData } = await supabasePatch(
      `/rest/v1/user_profiles?id=eq.${userId}`,
      { role: 'super_admin' },
      SERVICE_KEY
    );

    if (updateOk) {
      console.log(`  ✅ Role set to super_admin successfully!`);
      
      // Verify
      const { data: profile } = await supabaseGet(
        `/rest/v1/user_profiles?id=eq.${userId}&select=*`,
        SERVICE_KEY
      );
      if (Array.isArray(profile) && profile.length > 0) {
        console.log(`  🏫 Campus ID: ${profile[0].campus_id || 'None (global access)'}`);
        console.log(`  ✅ Current role: ${profile[0].role}`);
      }
    } else {
      console.log(`  ⚠ Update response:`, JSON.stringify(updateData).substring(0, 200));
    }

    // Auto-confirm email so user can sign in immediately
    console.log('\n📋 Step 3: Confirming email...');
    const confirmRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ email_confirm: true }),
      }
    );
    if (confirmRes.ok) {
      console.log('  ✅ Email confirmed — user can sign in immediately');
    } else {
      const confirmErr = await confirmRes.text();
      console.log(`  ⚠ Email confirmation: ${confirmErr.substring(0, 150)}`);
    }

    // Also sync the role to auth.users app_metadata for JWT refresh
    console.log('\n📋 Step 4: Syncing role to JWT app_metadata...');
    
    // Get the user's auth metadata
    const userAuthRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    
    if (userAuthRes.ok) {
      const userAuth = await userAuthRes.json();
      const currentMeta = userAuth?.app_metadata || {};
      currentMeta.role = 'super_admin';
      
      const updateMetaRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            app_metadata: currentMeta,
          }),
        }
      );
      
      if (updateMetaRes.ok) {
        console.log('  ✅ JWT app_metadata synced with super_admin role');
      } else {
        const metaErr = await updateMetaRes.text();
        console.log(`  ⚠ Failed to sync app_metadata: ${metaErr.substring(0, 150)}`);
        console.log('  💡 User may need to sign out and sign back in to refresh JWT');
      }
    }
  } else {
    // Print SQL for manual execution
    console.log('\n📋 Run this SQL in Supabase SQL Editor:');
    console.log('────────────────────────────────────────────────────');
    console.log(`UPDATE public.user_profiles`);
    console.log(`SET role = 'super_admin'`);
    console.log(`WHERE id = '${userId}';`);
    console.log('────────────────────────────────────────────────────\n');
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Super Admin Setup Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  📧 Email:    ' + SUPER_ADMIN.email);
  console.log('  🔑 Password: ' + SUPER_ADMIN.password);
  console.log('  👤 Name:     ' + SUPER_ADMIN.fullName);
  console.log('  🎭 Role:     super_admin\n');
  console.log('  🌐 Login at: http://localhost:5199/login\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
