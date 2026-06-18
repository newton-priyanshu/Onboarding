-- =============================================================================
-- Newton Onboarding Portal — Create 32 Test Users Directly
-- Paste this ENTIRE script into Supabase Dashboard → SQL Editor → Run
-- =============================================================================
-- This bypasses auth.signUp() rate limits by inserting directly into auth.users
-- =============================================================================

-- Enable required extension (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =============================================================================
-- STEP 1: Create 32 users in auth.users
-- =============================================================================
-- Password for all users: Test123! (bcrypt-hashed)

DO $$
DECLARE
  user_rec RECORD;
  uid UUID;
  user_data JSONB;
  users_data JSONB := '[
    {"name": "Arjun Mehta",       "email": "arjun.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Sneha Patel",       "email": "sneha.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Vikram Singh",      "email": "vikram.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Ananya Gupta",      "email": "ananya.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Rohit Sharma",      "email": "rohit.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Priya Patel",       "email": "priya.p.qa@newton.edu",   "role": "new_joinee"},
    {"name": "Aditya Kumar",      "email": "aditya.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Kavita Reddy",      "email": "kavita.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Rahul Jain",        "email": "rahul.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Meera Nair",        "email": "meera.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Amit Verma",        "email": "amit.v.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Deepa Iyer",        "email": "deepa.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Suresh Kumar",      "email": "suresh.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Neha Sharma",       "email": "neha.s.qa@newton.edu",    "role": "new_joinee"},
    {"name": "Vijay Patel",       "email": "vijay.qa@newton.edu",     "role": "new_joinee"},
    {"name": "Mohan Das",         "email": "mohan.qa@newton.edu",     "role": "lab_instructor"},
    {"name": "Lakshmi Krishnan",  "email": "lakshmi.qa@newton.edu",   "role": "lab_instructor"},
    {"name": "Rajesh Nair",       "email": "rajesh.qa@newton.edu",    "role": "lab_instructor"},
    {"name": "Neha Kapoor",       "email": "neha.qa@newton.edu",      "role": "lead_instructor"},
    {"name": "Rajesh Kumar",      "email": "rajesh.k.qa@newton.edu",  "role": "lead_instructor"},
    {"name": "Pooja Sharma",      "email": "pooja.qa@newton.edu",     "role": "lead_instructor"},
    {"name": "Amit Singh",        "email": "amit.s.qa@newton.edu",    "role": "lead_instructor"},
    {"name": "Sunita Verma",      "email": "sunita.qa@newton.edu",    "role": "lead_instructor"},
    {"name": "Dr. Priya Sharma",  "email": "priya.qa@newton.edu",     "role": "academic_head"},
    {"name": "Prof. Sanjay Joshi","email": "sanjay.qa@newton.edu",    "role": "academic_head"},
    {"name": "Dr. Anita Gupta",   "email": "anita.qa@newton.edu",     "role": "academic_head"},
    {"name": "Prof. Vikram Rao",  "email": "vikram.r.qa@newton.edu",  "role": "academic_head"},
    {"name": "Ravi Deshmukh",     "email": "ravi.qa@newton.edu",      "role": "onboarding_lead"},
    {"name": "Meera Iyer",        "email": "meera.i.qa@newton.edu",   "role": "onboarding_lead"},
    {"name": "Karan Mehta",       "email": "karan.qa@newton.edu",     "role": "onboarding_lead"},
    {"name": "Suresh Iyer",       "email": "suresh.i.qa@newton.edu",  "role": "acad_ops"},
    {"name": "Lakshmi Nair",      "email": "lakshmi.n.qa@newton.edu", "role": "acad_ops"}
  ]';
BEGIN
  FOR user_rec IN SELECT * FROM jsonb_to_recordset(users_data) AS x(name text, email text, role text)
  LOOP
    -- Skip if already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_rec.email) THEN
      RAISE NOTICE '⚠ Already exists: %', user_rec.email;
      CONTINUE;
    END IF;

    uid := gen_random_uuid();
    user_data := jsonb_build_object(
      'full_name', user_rec.name,
      'role', user_rec.role
    );

    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password, email_confirmed_at,
      confirmation_sent_at, confirmation_token,
      raw_user_meta_data, created_at, updated_at,
      last_sign_in_at
    ) VALUES (
      uid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      user_rec.email,
      extensions.crypt('Test123!', extensions.gen_salt('bf')),
      NOW(), NOW(), '',
      user_data, NOW(), NOW(), NOW()
    );

    RAISE NOTICE '✅ Created: % (%)', user_rec.name, user_rec.email;
  END LOOP;
END;
$$;

-- =============================================================================
-- STEP 2: Create user_profiles
-- =============================================================================
INSERT INTO user_profiles (id, email, full_name, role)
SELECT u.id, u.email, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'role'
FROM auth.users u
WHERE u.email LIKE '%@newton.edu%'
  AND NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = u.id);

DO $$ BEGIN
  RAISE NOTICE 'Profiles created: %', (SELECT count(*) FROM user_profiles WHERE email LIKE '%@newton.edu%');
END; $$;

-- =============================================================================
-- STEP 3: Assign buddies & managers to joinees
-- =============================================================================
DO $$
DECLARE
  buddy_list UUID[] := ARRAY(
    SELECT id FROM user_profiles WHERE role = 'lead_instructor' ORDER BY email
  );
  manager_list UUID[] := ARRAY(
    SELECT id FROM user_profiles WHERE role = 'academic_head' ORDER BY email
  );
  joinees UUID[] := ARRAY(
    SELECT id FROM user_profiles WHERE role IN ('new_joinee', 'lab_instructor') ORDER BY email
  );
  i INT := 1;
  b_idx INT;
  m_idx INT;
  j_id UUID;
  b_id UUID;
  m_id UUID;
BEGIN
  FOREACH j_id IN ARRAY joinees
  LOOP
    b_idx := ((i - 1) % array_length(buddy_list, 1)) + 1;
    m_idx := ((i - 1) % array_length(manager_list, 1)) + 1;
    b_id := buddy_list[b_idx];
    m_id := manager_list[m_idx];

    UPDATE user_profiles SET assigned_buddy_id = b_id WHERE id = j_id AND assigned_buddy_id IS NULL;
    UPDATE user_profiles SET assigned_lead_id = m_id WHERE id = j_id AND assigned_lead_id IS NULL;
    i := i + 1;
  END LOOP;

  RAISE NOTICE 'Buddies & managers assigned to % joinees', i - 1;
END;
$$;

-- =============================================================================
-- STEP 4: Verify
-- =============================================================================
SELECT
  role,
  count(*) AS total,
  count(*) FILTER (WHERE assigned_buddy_id IS NOT NULL) AS has_buddy,
  count(*) FILTER (WHERE assigned_lead_id IS NOT NULL) AS has_manager
FROM user_profiles
WHERE email LIKE '%@newton.edu%'
GROUP BY role
ORDER BY role;

SELECT '✅ ALL DONE! Users can now login with password: Test123!' AS result;
