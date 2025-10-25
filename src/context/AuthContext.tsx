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
    const sessionUrl = `${backendUrl}/api/auth/session`; // Define URL for logging
    console.log('[AuthContext] checkSession - Fetching from:', sessionUrl); // Log the URL being used
    try {
      const response = await fetch(sessionUrl, { // Use the defined URL
        method: 'GET',
        // --- START MODIFICATION ---
        // 'credentials: "include"' tells fetch to send cookies (like the session cookie)
        credentials: 'include',
        // --- END MODIFICATION ---
      });

      console.log('[AuthContext] checkSession - Response status:', response.status); // Log response status

      if (response.ok) {
        const data = await response.json();
        console.log('[AuthContext] checkSession - User data received:', data.user); // Log user data
        setUser(data.user);
        setStatus('authenticated');
      } else {
        console.warn('[AuthContext] checkSession - Session check failed or user not authenticated.');
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch (error) {
      console.error("[AuthContext] checkSession - Request failed:", error); // Log fetch errors
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
      console.log('[AuthContext] logout - Redirecting to /');
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