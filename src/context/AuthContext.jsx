import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { notifyError } from '../utils/errorHandling';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Listen for auth state changes ─────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        if (event === 'SIGNED_IN') {
          fetchProfile(session.user.id);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // ── Profile fetching ──────────────────────────────────────────
  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        if (error.message?.includes('infinite recursion')) {
          // RLS policy issue — fall back to auth metadata
          console.warn('RLS recursion detected, using auth metadata fallback');
          buildProfileFromMetadata();
          return;
        }
        notifyError('Error fetching profile:', error);
      }
      if (data) {
        setProfile(data);
      } else {
        // No profile found — auto-create for OAuth users
        await createProfileFromAuth(userId);
      }
    } catch (err) {
      if (err.message?.includes('infinite recursion')) {
        console.warn('RLS recursion detected, using auth metadata fallback');
        buildProfileFromMetadata();
        return;
      }
      notifyError('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function buildProfileFromMetadata() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const meta = user.user_metadata || {};
      setProfile({
        id: user.id,
        email: user.email,
        full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'User',
        role: meta.role || 'new_joinee',
      });
    } catch (err) {
      notifyError('Metadata fallback error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createProfileFromAuth(userId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fullName = user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] || 'User';

      // OAuth users default to new_joinee; role can be changed later by admin
      const { data: newProfile, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email: user.email,
          full_name: fullName,
          role: user.user_metadata?.role || 'new_joinee',
        })
        .select()
        .single();

      if (error) {
        // If insert fails (e.g. race condition), try fetching again
        const { data: retryProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (retryProfile) setProfile(retryProfile);
        return;
      }
      if (newProfile) setProfile(newProfile);
    } catch (err) {
      notifyError('Auto-profile creation error:', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Auth actions ──────────────────────────────────────────────
  async function signUp(email, password, fullName, role = 'new_joinee') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });
    if (error) throw error;

    // Create profile in user_profiles table
    if (data.user) {
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
      });
      if (profileError) notifyError('Profile creation error:', profileError);
    }

    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const hasRole = (...roles) => {
    return profile && roles.includes(profile.role);
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    hasRole,
    refreshProfile: () => user && fetchProfile(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
