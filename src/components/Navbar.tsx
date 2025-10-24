"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react'; // Import icons

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="w-full bg-secondary p-4 flex justify-between items-center border-b border-border relative shadow-lg">
      <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600">
        <Link href="/" onClick={() => setIsOpen(false)}>Zenith</Link>
      </div>

      <div className="hidden md:flex gap-x-8 text-md">
        <Link href="/dashboard" className="text-gray-300 hover:text-primary transition-colors">Dashboard</Link>
        <Link href="/charts" className="text-gray-300 hover:text-primary transition-colors">Charts</Link>
        <Link href="/settings" className="text-gray-300 hover:text-primary transition-colors">Settings</Link>
      </div>

      <div className="md:hidden">
        <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
          {isOpen ? (
            <X className="w-6 h-6" /> // Use X icon
          ) : (
            <Menu className="w-6 h-6" /> // Use Menu icon
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full bg-secondary md:hidden shadow-lg">
          <div className="flex flex-col items-center p-4">
            <Link href="/dashboard" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={() => setIsOpen(false)}>Dashboard</Link>
            <Link href="/charts" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={() => setIsOpen(false)}>Charts</Link>
            <Link href="/settings" className="py-3 text-gray-300 hover:text-primary transition-colors" onClick={() => setIsOpen(false)}>Settings</Link>
          </div>
        </div>
      )}
    </nav>
  );
}