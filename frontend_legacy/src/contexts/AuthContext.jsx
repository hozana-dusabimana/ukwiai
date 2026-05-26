import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("ukwi_access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const r = await authApi.me();
      setUser(r.data);
    } catch {
      localStorage.removeItem("ukwi_access_token");
      localStorage.removeItem("ukwi_refresh_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    const r = await authApi.login(email, password);
    localStorage.setItem("ukwi_access_token", r.data.access_token);
    localStorage.setItem("ukwi_refresh_token", r.data.refresh_token);
    const me = await authApi.me();
    setUser(me.data);
    return me.data;
  };

  const logout = () => {
    localStorage.removeItem("ukwi_access_token");
    localStorage.removeItem("ukwi_refresh_token");
    setUser(null);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh: fetchMe, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
