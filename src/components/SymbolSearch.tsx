"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input'; // Import Shadcn Input
import { Label } from '@/components/ui/label'; // Import Shadcn Label

interface SymbolSearchProps {
  symbols: string[];
  onSymbolSelect: (symbol: string) => void;
  initialSymbol: string;
}

export default function SymbolSearch({ symbols, onSymbolSelect, initialSymbol }: SymbolSearchProps) {
  const [searchTerm, setSearchTerm] = useState(initialSymbol);
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTerm === '') {
      setFilteredSymbols(symbols);
    } else {
      setFilteredSymbols(
        symbols.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
  }, [searchTerm, symbols]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleSelect = (symbol: string) => {
    setSearchTerm(symbol);
    onSymbolSelect(symbol);
    setIsOpen(false);
  };

  // Update searchTerm when initialSymbol changes (e.g., on connection)
  useEffect(() => {
    setSearchTerm(initialSymbol);
  }, [initialSymbol]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <Label htmlFor="symbol-search" className="text-sm font-bold text-gray-400 mb-1 block">Instrument</Label>
      <Input
        id="symbol-search"
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search symbol..."
        className="w-full bg-secondary" // Use secondary for a slightly darker input
      />
      {isOpen && filteredSymbols.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-secondary border border-border rounded-md max-h-60 overflow-y-auto shadow-lg">
          {filteredSymbols.map(symbol => (
            <li
              key={symbol}
              onClick={() => handleSelect(symbol)}
              className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
            >
              {symbol}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
