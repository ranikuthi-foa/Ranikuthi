import { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(mobileNumber, password) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { mobile_number: mobileNumber, password },
      skipAuth: true,
    });
    setToken(data.session_token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}