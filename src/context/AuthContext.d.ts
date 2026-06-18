import type { User, AuthError } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '../types/supabase';

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<{ data: unknown; error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ data: unknown; error: AuthError | null }>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthContextValue;

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement;
