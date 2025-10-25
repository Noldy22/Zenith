// src/components/Navbar.tsx
"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, LogIn, LogOut, User } from 'lucide-react'; // Import icons
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button'; // Import Button for styling

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session, status } = useSession(); // Get session data and status

  const handleLogout = () => {
    signOut({ callbackUrl: '/' }); // Redirect to home after logout
    setIsOpen(false);
  }

  const handleLogin = () => {
    // Redirect handled by NextAuth default behavior or middleware
    setIsOpen(false);
  }

  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="w-full bg-secondary p-4 flex justify-between items-center border-b border-border relative shadow-lg z-40">
      <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600">
        <Link href="/" onClick={closeMenu}>Zenith</Link>
      </div>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center gap-x-8 text-md">
        {status === "authenticated" && (
          <>
            <Link href="/dashboard" className="text-gray-300 hover:text-primary transition-colors">Dashboard</Link>
            <Link href="/charts" className="text-gray-300 hover:text-primary transition-colors">Charts</Link>
            <Link href="/settings" className="text-gray-300 hover:text-primary transition-colors">Settings</Link>
          </>
        )}
        {status === "loading" ? (
          <span className="text-gray-500">Loading...</span>
        ) : status === "authenticated" ? (
          <>
             <span className="text-gray-400 text-sm flex items-center gap-1">
                <User size={16} /> {session.user?.name || session.user?.email}
             </span>
             <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-400 hover:text-red-300 hover:bg-red-900/50">
                <LogOut className="w-4 h-4 mr-1" /> Logout
             </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth/signin">
              <LogIn className="w-4 h-4 mr-1" /> Login
            </Link>
          </Button>
        )}
      </div>

      {/* Mobile Menu Button */}
      <div className="md:hidden">
        <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu" className="relative z-50">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full bg-secondary md:hidden shadow-lg z-50">
          <div className="flex flex-col items-center p-4">
            {status === "authenticated" ? (
              <>
                 <span className="py-3 text-gray-400 text-sm flex items-center gap-1">
                     <User size={16} /> {session.user?.name || session.user?.email}
                 </span>
                <Link href="/dashboard" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={closeMenu}>Dashboard</Link>
                <Link href="/charts" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={closeMenu}>Charts</Link>
                <Link href="/settings" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={closeMenu}>Settings</Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-400 hover:text-red-300 mt-2">
                    <LogOut className="w-4 h-4 mr-1" /> Logout
                </Button>
              </>
            ) : status === "loading" ? (
                <span className="py-3 text-gray-500">Loading...</span>
            ) : (
               <Button variant="ghost" size="sm" asChild>
                    <Link href="/auth/signin" onClick={closeMenu}>
                    <LogIn className="w-4 h-4 mr-1" /> Login
                    </Link>
                </Button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}