import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../api/supabase';
import { notifyError } from '../utils/errorHandling';
import { triggerNotification, getReviewerUserIds } from '../hooks/useNotifications';
import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '../types/supabase';

// ─── Types ──────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<{ user: User | null }>;
  signIn: (email: string, password: string) => Promise<{ user: User | null }>;
  signInWithGoogle: () => Promise<{ url: string | null } | undefined>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  refreshProfile: () => void;
}

type ProfileState = UserProfile | null;

// ─── Context ────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileState>(null);
  const [loading, setLoading] = useState(true);

  // ── Profile fetching ──────────────────────────────────────────
  async function fetchProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, role, department, assigned_lead_id, assigned_buddy_id, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        if ((error as { message?: string }).message?.includes('infinite recursion')) {
          console.warn('RLS recursion detected, using auth metadata fallback');
          await buildProfileFromMetadata();
          return;
        }
        notifyError('Error fetching profile:', error);
      }
      if (data) {
        setProfile(data as UserProfile);
      } else {
        // No profile found — auto-create for OAuth users
        await createProfileFromAuth(userId);
      }
    } catch (err) {
      const error = err as { message?: string };
      if (error.message?.includes('infinite recursion')) {
        console.warn('RLS recursion detected, using auth metadata fallback');
        await buildProfileFromMetadata();
        return;
      }
      notifyError('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function buildProfileFromMetadata(): Promise<void> {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const meta = u.user_metadata || {};
      setProfile({
        id: u.id,
        email: u.email ?? null,
        full_name: (meta.full_name as string) || (meta.name as string) || u.email?.split('@')[0] || 'User',
        role: (meta.role as UserRole) || 'new_joinee',
        department: null,
        assigned_lead_id: null,
        assigned_buddy_id: null,
        created_at: '',
        updated_at: '',
      });
    } catch (err) {
      notifyError('Metadata fallback error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createProfileFromAuth(userId: string): Promise<void> {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;

      const fullName: string = (u.user_metadata?.full_name as string) ||
        (u.user_metadata?.name as string) ||
        u.email?.split('@')[0] || 'User';

      const role = (u.user_metadata?.role as string) || 'new_joinee';

      const { data: newProfile, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email: u.email,
          full_name: fullName,
          role,
        })
        .select()
        .single();

      if (error) {
        const { data: retryProfile } = await supabase
          .from('user_profiles')
          .select('id, email, full_name, role, department, assigned_lead_id, assigned_buddy_id, created_at, updated_at')
          .eq('id', userId)
          .single();
        if (retryProfile) setProfile(retryProfile as UserProfile);
        return;
      }
      if (newProfile) setProfile(newProfile as UserProfile);
    } catch (err) {
      notifyError('Auto-profile creation error:', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Listen for auth state changes ─────────────────────────────
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth actions ──────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, fullName: string, role: UserRole = 'new_joinee') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });
    if (error) throw error;

    if (data?.user?.identities && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
      });
      if (profileError) notifyError('Profile creation error:', profileError);

      if (role === 'new_joinee' || role === 'lab_instructor') {
        const adminIds = await getReviewerUserIds('manager');
        const onboardingIds = await getReviewerUserIds('onboarding_lead');
        const allRecipients = [...new Set([...adminIds, ...onboardingIds])];
        for (const recipientId of allRecipients) {
          await triggerNotification({
            userId: recipientId,
            fromUserId: data.user.id,
            worksheetId: '',
            type: 'submitted',
            message: `New ${role === 'new_joinee' ? 'Joinee' : 'Lab Instructor'} joined: ${fullName} (${email}). They need a manager and buddy assigned.`,
          });
        }
      }
    }

    return { user: data.user };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  }, []);

  const hasRole = useCallback((...roles: UserRole[]): boolean => {
    return !!profile && roles.includes(profile.role);
  }, [profile]);

  const refreshProfile = useCallback(() => {
    if (user) fetchProfile(user.id);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    hasRole,
    refreshProfile,
  }), [user, profile, loading, signUp, signIn, signInWithGoogle, signOut, hasRole, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
