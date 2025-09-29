"use client";

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');

  // This will load saved credentials when the page loads, if they exist
  useEffect(() => {
    const savedCreds = localStorage.getItem('mt5_credentials');
    if (savedCreds) {
      const { login, password, server } = JSON.parse(savedCreds);
      setMt5Login(login || '');
      setMt5Password(password || '');
      setMt5Server(server || '');
    }
  }, []);

  const handleSave = () => {
    // Save credentials to the browser's local storage
    localStorage.setItem('mt5_credentials', JSON.stringify({
      login: parseInt(mt5Login, 10),
      password: mt5Password,
      server: mt5Server,
    }));
    alert('Credentials saved!');
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <div className="max-w-md bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-white">MT5 Account Connection</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">MT5 Login ID</label>
            <input
              type="text"
              placeholder="e.g., 210839885"
              value={mt5Login}
              onChange={(e) => setMt5Login(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              placeholder="Enter your MT5 password"
              value={mt5Password}
              onChange={(e) => setMt5Password(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Server</label>
            <input
              type="text"
              placeholder="e.g., Exness-MT5Trial9"
              value={mt5Server}
              onChange={(e) => setMt5Server(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition-colors"
          >
            Save Credentials
          </button>
        </div>
      </div>
    </main>
  );
}