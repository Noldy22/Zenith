// src/app/auth/verify-token/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function VerifyTokenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkSession } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      // Store the token and then trigger a session check
      try {
        localStorage.setItem('jwt_token', token);
        // Trigger the session check which will now find and validate the token
        checkSession().then(() => {
          router.push('/dashboard');
        });
      } catch (error) {
        console.error("Failed to save token:", error);
        router.push('/auth/signin?error=TokenSaveFailed');
      }
    } else {
      router.push('/auth/signin?error=NoTokenProvided');
    }
    // checkSession is stable and doesn't need to be in dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="text-center">
        <p className="text-lg">Verifying your session...</p>
        {/* You can add a spinner or loading animation here */}
      </div>
    </div>
  );
}
