// src/app/auth/reset-password/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { getBackendUrl } from '@/lib/utils';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const backendUrl = getBackendUrl();

  useEffect(() => {
    if (!token) {
      setError("No reset token found. Please request a new reset link.");
    }
  }, [token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== verifyPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
        setError("No reset token found. Please request a new reset link.");
        return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/auth/reset-password`, {
        method: "POST",
        body: JSON.stringify({ token, password }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
        setTimeout(() => router.push('/auth/signin'), 3000); // Redirect after 3s
      } else {
        setError(data.error || `Request failed. Status: ${res.status}`);
      }
    } catch (err) {
      console.error("Reset Password Error:", err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">Enter your new password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-center text-red-500 text-sm">{error}</p>}
          {message && <p className="text-center text-green-500 text-sm">{message}</p>}
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="pr-10"
              />
               <button
                type="button"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 10.73 5.09 16.36a10.23 10.23 0 0 1-2.11-1.23C1.23 12.83 1 12 1 12s3-7 11-7a11.53 11.53 0 0 1 4.24 1M1 1l22 22"/></svg>
                )}
              </button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-password">Verify New Password</Label>
              <Input
                id="verify-password"
                type={showPassword ? "text" : "password"}
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.targe
                t.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !token}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="text-center text-sm">
           <p className="text-muted-foreground w-full">
            Return to{' '}
            <Link href="/auth/signin" className="text-primary hover:underline">
              Sign In
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}