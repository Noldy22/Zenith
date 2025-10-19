// src/components/Chat.tsx
"use client";

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'model';
  parts: string;
}

interface ChatProps {
  analysisContext: any; // The full analysis result
}

export default function Chat({ analysisContext }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  
  // Initial message when analysis is ready
  useEffect(() => {
    if (analysisContext) {
        setMessages([{
            role: 'model',
            parts: 'Hello! I am Zenith, your AI trading assistant. The analysis for this chart is complete. Feel free to ask me any questions about it.'
        }]);
    }
  }, [analysisContext]);


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', parts: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`http://${window.location.hostname}:5000/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          analysis_context: analysisContext,
          history: newMessages.slice(0, -1), // Send history without the latest user message
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get a response.');
      }

      setMessages([...newMessages, { role: 'model', parts: result.reply }]);
    } catch (error: any) {
      setMessages([...newMessages, { role: 'model', parts: `Sorry, I encountered an error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg p-4">
      <h3 className="text-xl font-bold text-white mb-4">Chat with Zenith AI</h3>
      <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${msg.role === 'user' ? 'bg-primary text-background' : 'bg-gray-700 text-white'}`}>
              <p className="text-sm">{msg.parts}</p>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="max-w-xs p-3 rounded-lg bg-gray-700 text-white">
                    <p className="text-sm animate-pulse">Thinking...</p>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the analysis..."
          className="flex-grow bg-gray-900 border border-border rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        />
        <button type="submit" className="px-4 py-2 bg-primary hover:bg-yellow-600 rounded-lg text-background font-semibold transition-colors disabled:opacity-50" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}