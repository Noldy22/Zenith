"use client";

import Link from 'next/link';
import { useState } from 'react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="w-full bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700 relative">
      {/* Logo/Brand Name */}
      <div className="text-xl font-bold">
        <Link href="/" onClick={() => setIsOpen(false)}>Zenith</Link>
      </div>

      {/* Desktop Links (Visible on medium screens and up) */}
      <div className="hidden md:flex gap-x-6 text-sm">
        <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link>
        <Link href="/charts" className="text-gray-300 hover:text-white transition-colors">Charts</Link>
        <Link href="/settings" className="text-gray-300 hover:text-white transition-colors">Settings</Link>
      </div>

      {/* Hamburger Menu Button (Visible on small screens) */}
      <div className="md:hidden">
        <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {/* Mobile Menu (Dropdown) */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full bg-gray-800 md:hidden">
          <div className="flex flex-col items-center p-4">
            <Link href="/dashboard" className="py-2 text-gray-300" onClick={() => setIsOpen(false)}>Dashboard</Link>
            <Link href="/charts" className="py-2 text-gray-300" onClick={() => setIsOpen(false)}>Charts</Link>
            <Link href="/settings" className="py-2 text-gray-300" onClick={() => setIsOpen(false)}>Settings</Link>
          </div>
        </div>
      )}
    </nav>
  );
}