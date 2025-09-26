"use client";

import React, { useState, useEffect, useRef } from 'react';

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

  // Filter symbols based on the search term
  useEffect(() => {
    if (searchTerm === '') {
      setFilteredSymbols(symbols);
    } else {
      setFilteredSymbols(
        symbols.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
  }, [searchTerm, symbols]);

  // Effect to handle clicks outside the component to close the dropdown
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
    setSearchTerm(symbol); // Update input text to the selected symbol
    onSymbolSelect(symbol); // Trigger the chart load on the parent page
    setIsOpen(false); // Close the dropdown
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="text-sm font-bold text-gray-400 mb-1 block">Instrument</label>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search symbol..."
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
      />
      {isOpen && filteredSymbols.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md max-h-60 overflow-y-auto shadow-lg">
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