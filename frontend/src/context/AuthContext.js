import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { clearKissflowNativeSession, clearNativeAppSession } from '../utils/nativeSession';
import { API } from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('iam_token'));
  const [loading, setLoading] = useState(true);

  // Cookie lets /api/oidc/.../authorize silent-SSO when Feast/QR call authorize without ?token=
  const persistToken = (newToken) => {
    if (!newToken) return;
    localStorage.setItem('iam_token', newToken);
    try {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `iam_token=${encodeURIComponent(newToken)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
    } catch (e) {
      // ignore
    }
  };

  const clearToken = () => {
    localStorage.removeItem('iam_token');
    try {
      document.cookie = 'iam_token=; Path=/; Max-Age=0; SameSite=Lax';
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
          setOrganization(response.data.organization);
          persistToken(token);
        } catch (error) {
          console.error('Auth check failed:', error);
          clearToken();
          setToken(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    clearKissflowNativeSession();
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken } = response.data;
    persistToken(newToken);
    setToken(newToken);
    const me = await axios.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    setUser(me.data);
    setOrganization(me.data.organization);
    return me.data;
  };

  const register = async (email, password, name, orgId) => {
    const response = await axios.post(`${API}/auth/register`, { 
      email, 
      password, 
      name,
      org_id: orgId
    });
    const { token: newToken, user: userData } = response.data;
    persistToken(newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const createOrganization = async (name, domain, description) => {
    const response = await axios.post(`${API}/organizations`, { name, domain, description });
    return response.data;
  };

  const logout = () => {
    clearNativeAppSession();
    clearToken();
    setToken(null);
    setUser(null);
    setOrganization(null);
  };

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const refreshUser = async () => {
    if (token) {
      try {
        const response = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(response.data);
        setOrganization(response.data.organization);
      } catch (error) {
        console.error('Refresh user failed:', error);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      organization,
      token, 
      loading, 
      login, 
      register,
      createOrganization,
      logout, 
      getAuthHeader,
      refreshUser,
      API 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
