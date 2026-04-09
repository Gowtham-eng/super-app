import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('iam_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
          setOrganization(response.data.organization);
        } catch (error) {
          console.error('Auth check failed:', error);
          localStorage.removeItem('iam_token');
          setToken(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('iam_token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const register = async (email, password, name, orgId) => {
    const response = await axios.post(`${API}/auth/register`, { 
      email, 
      password, 
      name,
      org_id: orgId
    });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('iam_token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const createOrganization = async (name, domain, description) => {
    const response = await axios.post(`${API}/organizations`, { name, domain, description });
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('iam_token');
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
