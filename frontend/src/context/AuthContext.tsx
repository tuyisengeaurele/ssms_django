import axios from 'axios';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../types';
import api from '../services/api';
import { authService } from '../services/auth.service';
import {
  clearLegacyStorage, forgetSession, hasSessionHint, refreshAccessToken, rememberSession, setAccessToken,
} from '../services/session';

interface AuthContextValue {
  user: User | null;
  /** True while a sign in from before a page reload is being restored. */
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  /** Replace the user on screen, for example after the profile is edited. */
  updateUser: (user: User) => void;
  /** Read the user again from /api/auth/me. */
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * After a page reload there is no access token in memory. If a sign in may still be alive, ask for a new token with
 * the refresh cookie and read who it belongs to. Nothing about the person is kept in browser storage.
 */
async function restoreSession(): Promise<User | null> {
  if (!hasSessionHint()) return null;
  try {
    await refreshAccessToken();
    const res = await api.get<{ data: User }>('/auth/me');
    return res.data.data;
  } catch (error) {
    setAccessToken(null);
    // No answer at all (offline) says nothing about the session, so the flag stays for the next try.
    if (axios.isAxiosError(error) && !error.response) return null;
    forgetSession();
    try {
      sessionStorage.setItem('ssms_notice', 'session_ended');
    } catch {
      // The note is a courtesy.
    }
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let live = true;
    clearLegacyStorage();
    restoreSession()
      .then((restored) => { if (live) setUser(restored); })
      .finally(() => { if (live) setIsLoading(false); });
    return () => { live = false; };
  }, []);

  const login = (userData: User, jwt: string) => {
    setAccessToken(jwt);
    rememberSession();
    setUser(userData);
  };

  const logout = useCallback(() => {
    // Tell server to blacklist the refresh cookie and clear it
    authService.logout().catch(() => {
      // Ignore, the cookie is cleared by the server when it can be reached and the page forgets the sign in regardless
    });
    forgetSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ data: User }>('/auth/me');
      updateUser(res.data.data);
    } catch {
      // If refresh fails (e.g. token expired) the interceptor will redirect to /login
    }
  }, [updateUser]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
