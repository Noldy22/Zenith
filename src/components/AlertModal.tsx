"use client";

import { useAlert } from '@/context/AlertContext';

export default function AlertModal() {
  const { isOpen, message, type, hideAlert } = useAlert();

  if (!isOpen) return null;

  const typeStyles = {
    success: {
      borderColor: 'border-green-500',
      buttonColor: 'bg-green-600 hover:bg-green-700',
      title: 'Success',
    },
    error: {
      borderColor: 'border-red-500',
      buttonColor: 'bg-red-600 hover:bg-red-700',
      title: 'Error',
    },
    info: {
      borderColor: 'border-blue-500',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
      title: 'Information',
    },
  };

  const currentStyle = typeStyles[type];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className={`bg-secondary p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 ${currentStyle.borderColor}`}>
        <h3 className="font-bold text-2xl text-white mb-4">{currentStyle.title}</h3>
        <p className="text-gray-300 mb-6">{message}</p>
        <button
          onClick={hideAlert}
          className={`w-full px-4 py-3 rounded-lg text-white font-bold text-lg transition-colors ${currentStyle.buttonColor}`}
        >
          OK
        </button>
      </div>
    </div>
  );
}