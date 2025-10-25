// src/components/Navbar.tsx
"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext'; // Import our new useAuth hook
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, status, logout } = useAuth(); // Get auth state from our context

  const handleLogout = () => {
    logout(); // Call the logout function from our context
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
        ) : status === "authenticated" && user ? (
          <>
             <Link href="/account" className="text-gray-400 hover:text-primary transition-colors text-sm flex items-center gap-1">
                <User size={16} /> {user.name || user.email}
             </Link>
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
            {status === "authenticated" && user ? (
              <>
                 <Link href="/account" className="py-3 text-gray-400 hover:text-primary transition-colors text-sm flex items-center gap-1" onClick={closeMenu}>
                     <User size={16} /> {user.name || user.email}
                 </Link>
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