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
    const token = localStorage.getItem('jwt_token');

    // 1. Check for JWT first
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const isExpired = payload.exp * 1000 < Date.now();
            if (isExpired) {
                console.warn('[AuthContext] JWT expired, removing.');
                localStorage.removeItem('jwt_token');
                // Don't return yet, fall through to cookie check
            } else {
                setUser({ id: payload.id, email: payload.email, name: payload.name });
                setStatus('authenticated');
                console.log('[AuthContext] Session validated with JWT.');
                return; // Found valid JWT, no need to check for cookie
            }
        } catch (error) {
            console.error('[AuthContext] Failed to decode JWT:', error);
            localStorage.removeItem('jwt_token');
            // Fall through to cookie check
        }
    }

    // 2. If no valid JWT, fall back to cookie-based session check
    console.log('[AuthContext] No valid JWT, checking for session cookie...');
    const backendUrl = getBackendUrl();
    const sessionUrl = `${backendUrl}/api/auth/session`;
    try {
      const response = await fetch(sessionUrl, {
        method: 'GET',
        credentials: 'include', // Important for sending the session cookie
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setStatus('authenticated');
        console.log('[AuthContext] Session validated with cookie.');
      } else {
        setUser(null);
        setStatus('unauthenticated');
        console.log('[AuthContext] No active session found (checked JWT and cookie).');
      }
    } catch (error) {
      console.error("[AuthContext] Session check fetch failed:", error);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const setTokenAndUser = (token: string, userData: User) => {
    try {
        localStorage.setItem('jwt_token', token);
        setUser(userData);
        setStatus('authenticated');
        console.log('[AuthContext] Token and user set successfully.');
    } catch (error) {
        console.error('[AuthContext] Failed to save token to local storage:', error);
    }
  };

  // Check session on initial load
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (email: string, password: string): Promise<boolean | string> => {
    setStatus('loading');
    const backendUrl = getBackendUrl();
    const signinUrl = `${backendUrl}/api/auth/signin`;
    console.log('[AuthContext] login - Posting to:', signinUrl);
    try {
      const response = await fetch(signinUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include', // Send cookies
      });

      const data = await response.json();
      console.log('[AuthContext] login - Response status:', response.status);

      if (response.ok) {
        console.log('[AuthContext] login - Success, user:', data.user);
        setUser(data.user);
        setStatus('authenticated');
        return true;
      } else {
        console.warn('[AuthContext] login - Failed:', data.error || 'Unknown error');
        // setError(data.error || 'Login failed.'); // setError is not defined here, handle in component
        return data.error || 'Login failed.';
      }
    } catch (err) {
      console.error("[AuthContext] login - Request failed:", err);
      const errorMsg = 'An unexpected error occurred. Please try again.';
      // setError(errorMsg); // setError is not defined here
      return errorMsg;
    } finally {
        // Removed setStatus('unauthenticated') from finally block for login
    }
  };

  const logout = async () => {
    setStatus('loading');
    const backendUrl = getBackendUrl();
    const logoutUrl = `${backendUrl}/api/auth/logout`;
    console.log('[AuthContext] logout - Posting to:', logoutUrl);
    try {
      await fetch(logoutUrl, {
        method: 'POST',
        credentials: 'include',
      });
      console.log('[AuthContext] logout - Logout request successful.');
    } catch (error) {
      console.error("[AuthContext] logout - Request failed:", error);
    } finally {
      setUser(null);
      setStatus('unauthenticated');
      localStorage.removeItem('jwt_token');
      console.log('[AuthContext] logout - Redirecting to /');
      // Redirect to home page after logout
      router.push('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: status === 'loading', status, login, logout, checkSession, setTokenAndUser }}>
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