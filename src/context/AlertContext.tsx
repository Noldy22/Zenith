"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

type AlertType = 'success' | 'error' | 'info';

interface AlertContextType {
  isOpen: boolean;
  message: string;
  type: AlertType;
  showAlert: (message: string, type?: AlertType) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AlertType>('info');

  const showAlert = (newMessage: string, newType: AlertType = 'info') => {
    setMessage(newMessage);
    setType(newType);
    setIsOpen(true);
  };

  const hideAlert = () => {
    setIsOpen(false);
  };

  return (
    <AlertContext.Provider value={{ isOpen, message, type, showAlert, hideAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};