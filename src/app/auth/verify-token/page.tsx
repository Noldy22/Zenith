// src/app/auth/verify-token/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function VerifyTokenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokenAndUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      // Decode token to get user info (basic decode, no verification needed here as it's from our own backend)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          id: payload.id,
          email: payload.email,
          name: payload.name,
        };
        // Use the context function to set token and user data
        setTokenAndUser(token, user);
        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error) {
        console.error("Failed to decode token:", error);
        // Redirect to signin with an error
        router.push('/auth/signin?error=InvalidToken');
      }
    } else {
      // No token found, redirect to signin
      router.push('/auth/signin?error=NoTokenProvided');
    }
  }, [searchParams, router, setTokenAndUser]);

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="text-center">
        <p className="text-lg">Verifying your session...</p>
        {/* You can add a spinner or loading animation here */}
      </div>
    </div>
  );
}
