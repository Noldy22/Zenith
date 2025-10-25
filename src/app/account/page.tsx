// src/app/account/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { ToastContainer, toast } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import { getBackendUrl } from "@/lib/utils";

export default function AccountPage() {
    const { user, status, fetchUser } = useAuth();
    const router = useRouter();

    const [name, setName] = useState('');
    const [nameChangePassword, setNameChangePassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
        if (user) {
            setName(user.name || '');
        }
    }, [status, user, router]);

    const handleUpdateName = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        toast.info("Updating name...");

        try {
            const response = await fetch(`${getBackendUrl()}/api/update_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, current_password: nameChangePassword }),
            });

            const result = await response.json();

            if (response.ok) {
                toast.success("Name updated successfully!");
                await fetchUser(); // Re-fetch user data to update the UI
                setNameChangePassword(''); // Clear password field on success
            } else {
                toast.error(result.error || "Failed to update name.");
            }
        } catch (error) {
            toast.error("An error occurred while updating your name.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdatePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match.");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("New password must be at least 6 characters long.");
            return;
        }

        setIsSaving(true);
        toast.info("Updating password...");

        try {
            const response = await fetch(`${getBackendUrl()}/api/update_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });

            const result = await response.json();

            if (response.ok) {
                toast.success("Password updated successfully!");
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast.error(result.error || "Failed to update password.");
            }
        } catch (error) {
            toast.error("An error occurred while updating your password.");
        } finally {
            setIsSaving(false);
        }
    };

    if (status === 'loading' || !user) {
        return <div className="p-8 text-center animate-pulse">Loading account details...</div>;
    }

    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <ToastContainer theme="dark" position="bottom-right" />
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
                My Account
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* User Details */}
                <Card>
                    <CardHeader>
                        <CardTitle>Account Information</CardTitle>
                        <CardDescription>Your personal and account details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label>Username</Label>
                            <p className="text-muted-foreground">{user.name || 'Not set'}</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Email</Label>
                            <p className="text-muted-foreground">{user.email}</p>
                        </div>
                         <div className="space-y-1">
                            <Label>Account Type</Label>
                            <p className="text-muted-foreground">{user.is_google_account ? 'Google Account' : 'Email & Password'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Update Name */}
                <Card>
                    <CardHeader>
                        <CardTitle>Update Name</CardTitle>
                         <CardDescription>Change the name associated with your account.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleUpdateName}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Username</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={isSaving || user.is_google_account}
                                />
                                {user.is_google_account && <p className="text-xs text-muted-foreground">Username cannot be changed for Google accounts.</p>}
                            </div>
                             {!user.is_google_account && (
                                <div className="space-y-2">
                                    <Label htmlFor="name_change_password">Confirm Password</Label>
                                    <Input
                                        id="name_change_password"
                                        type="password"
                                        value={nameChangePassword}
                                        onChange={(e) => setNameChangePassword(e.target.value)}
                                        disabled={isSaving}
                                        required
                                    />
                                </div>
                            )}
                            <Button type="submit" disabled={isSaving || user.is_google_account}>
                                {isSaving ? 'Saving...' : 'Save Name'}
                            </Button>
                        </CardContent>
                    </form>
                </Card>

                {/* Update Password */}
                {!user.is_google_account && (
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Change Password</CardTitle>
                            <CardDescription>Update your account password.</CardDescription>
                        </CardHeader>
                        <form onSubmit={handleUpdatePassword}>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current_password">Current Password</Label>
                                    <Input
                                        id="current_password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        disabled={isSaving}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new_password">New Password</Label>
                                    <Input
                                        id="new_password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        disabled={isSaving}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                                    <Input
                                        id="confirm_password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={isSaving}
                                        required
                                    />
                                </div>
                            </CardContent>
                            <div className="p-6 pt-0">
                               <Button type="submit" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : 'Update Password'}
                               </Button>
                            </div>
                        </form>
                    </Card>
                )}
            </div>
        </main>
    );
}
