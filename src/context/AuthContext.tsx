// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getBackendUrl } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  status: 'authenticated' | 'unauthenticated' | 'loading';
  login: (email: string, pass: string) => Promise<boolean | string>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'authenticated' | 'unauthenticated' | 'loading'>('loading');
  const router = useRouter();

  const checkSession = useCallback(async () => {
    setStatus('loading');
    const backendUrl = getBackendUrl();
    try {
      const response = await fetch(`${backendUrl}/api/auth/session`, {
        method: 'GET',
        // 'credentials: "include"' tells fetch to send cookies (like the session cookie)
        credentials: 'include', 
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch (error) {
      console.error("Session check failed:", error);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // Check session on initial load
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (email: string, password: string): Promise<boolean | string> => {
    setStatus('loading');
    const backendUrl = getBackendUrl();
    try {
      const response = await fetch(`${backendUrl}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include', // Send cookies
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setStatus('authenticated');
        return true;
      } else {
        setError(data.error || 'Login failed.');
        return data.error || 'Login failed.';
      }
    } catch (err) {
      console.error("Login request failed:", err);
      const errorMsg = 'An unexpected error occurred. Please try again.';
      setError(errorMsg);
      return errorMsg;
    }
  };

  const logout = async () => {
    setStatus('loading');
    const backendUrl = getBackendUrl();
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setUser(null);
      setStatus('unauthenticated');
      // Redirect to home page after logout
      router.push('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: status === 'loading', status, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};