import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  me as apiMe,
  setToken,
  setRefreshToken,
  setStoredUser,
  getToken,
  getStoredUser,
  clearAuth,
} from "../lib/api";

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { full_name: string; email: string; password: string; phone?: string; role?: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser() as AuthUser | null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await apiMe();
      setUser(u);
      setStoredUser(u);
    } catch (err) {
      console.warn("auth refresh failed", err);
      clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    const u = await apiMe();
    setUser(u);
    setStoredUser(u);
  }, []);

  const handleRegister = useCallback(async (input: { full_name: string; email: string; password: string; phone?: string; role?: string }) => {
    await apiRegister(input);
    await handleLogin(input.email, input.password);
  }, [handleLogin]);

  const handleLogout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login: handleLogin, register: handleRegister, logout: handleLogout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
