import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../types';
import api from '../services/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (user: User, token: string, refreshToken?: string) => void;
  logout: () => void;
  /** Overwrite the in-memory + localStorage user snapshot (e.g. after profile edit). */
  updateUser: (user: User) => void;
  /** Re-fetch /api/auth/me and sync the stored user snapshot. */
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('ssms_token');
    const storedUser = localStorage.getItem('ssms_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser) as User);
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User, jwt: string, refreshJwt?: string) => {
    setUser(userData);
    setToken(jwt);
    localStorage.setItem('ssms_token', jwt);
    localStorage.setItem('ssms_user', JSON.stringify(userData));
    if (refreshJwt) localStorage.setItem('ssms_refresh_token', refreshJwt);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('ssms_token');
    localStorage.removeItem('ssms_user');
    localStorage.removeItem('ssms_refresh_token');
  };

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
    localStorage.setItem('ssms_user', JSON.stringify(userData));
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
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
