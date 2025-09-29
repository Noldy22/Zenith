"use client";

import { useState, useEffect } from 'react';
import { useAlert } from '@/context/AlertContext';

export default function SettingsPage() {
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const { showAlert } = useAlert(); // Use our custom alert hook

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
    localStorage.setItem('mt5_credentials', JSON.stringify({
      login: parseInt(mt5Login, 10),
      password: mt5Password,
      server: mt5Server,
    }));
    showAlert('Credentials saved! Please connect on the Charts page.', 'success');
  };

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
        Settings
      </h1>
      <div className="max-w-lg mx-auto bg-secondary p-8 rounded-xl shadow-2xl text-center">
        <h2 className="text-2xl font-bold mb-4 text-white">Application Settings</h2>
        <p className="text-gray-400">
          Future application settings like theme preferences, notifications, and more will be available here.
        </p>
        <p className="text-gray-400 mt-2">
          MT5 account connection is now managed directly on the Charts page.
        </p>
      </div>
    </main>
  );
}