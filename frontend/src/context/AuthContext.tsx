import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ActingInfo, User } from '../types';
import api from '../services/api';
import { authService } from '../services/auth.service';
import {
  clearLegacyStorage, endedNotice, forgetSession, getAccessToken, hasSessionHint, leaveNotice, onSupportEnded, refreshAccessToken,
  rememberSession, serverRefusedTheSession, setAccessToken, setActing,
} from '../services/session';

interface AuthContextValue {
  user: User | null;
  /** True while a sign in from before a page reload is being restored. */
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  /** Set while an admin acts as a farmer or supervisor with their consent. `user` is then the person. */
  acting: ActingInfo | null;
  /** Become the person with the support token. Rejects, and stays the admin, when the person cannot be read. */
  startActing: (token: string, info: Omit<ActingInfo, 'person'>) => Promise<void>;
  /** Go back to being the admin. */
  stopActing: () => void;
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
    // No answer, or a 5xx while the server wakes or restarts, says nothing about the session, so the flag stays for the next try.
    if (!serverRefusedTheSession(error)) return null;
    forgetSession();
    leaveNotice(endedNotice(error));
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

  const [acting, setActingInfo] = useState<ActingInfo | null>(null);
  // The admin, held aside while they act as somebody else. Memory only, like the access token.
  const held = useRef<{ user: User; token: string | null } | null>(null);
  const userNow = useRef<User | null>(null);
  userNow.current = user;

  const login = (userData: User, jwt: string) => {
    setAccessToken(jwt);
    rememberSession();
    setUser(userData);
  };

  const stopActing = useCallback(() => {
    const admin = held.current;
    if (!admin) return;
    held.current = null;
    setAccessToken(admin.token);
    setActing(false);
    setUser(admin.user);
    setActingInfo(null);
  }, []);

  const startActing = useCallback(async (token: string, info: Omit<ActingInfo, 'person'>) => {
    if (held.current || !userNow.current) return;
    held.current = { user: userNow.current, token: getAccessToken() };
    setAccessToken(token);
    setActing(true);
    try {
      const res = await api.get<{ data: User }>('/auth/me');
      setUser(res.data.data);
      setActingInfo({ ...info, person: res.data.data });
    } catch (error) {
      const admin = held.current;
      held.current = null;
      setActing(false);
      setAccessToken(admin?.token ?? null);
      throw error;
    }
  }, []);

  // The server says the visit is over, or its token ran out: back to the admin.
  useEffect(() => onSupportEnded(stopActing), [stopActing]);

  const logout = useCallback(() => {
    // While acting, the person's token is in hand. Sign the admin out, not the person: go back first.
    stopActing();
    // Tell server to blacklist the refresh cookie and clear it
    authService.logout().catch(() => {
      // Ignore, the cookie is cleared by the server when it can be reached and the page forgets the sign in regardless
    });
    forgetSession();
    setUser(null);
  }, [stopActing]);

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
    <AuthContext.Provider value={{ user, isLoading, login, logout, acting, startActing, stopActing, updateUser, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
