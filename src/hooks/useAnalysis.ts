
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAlert } from '@/context/AlertContext';
import { AnalysisResult, timeframes } from '@/lib/types';
import { io, Socket } from 'socket.io-client';

const getBackendUrl = () => {
    if (typeof window !== 'undefined') {
        return `http://${window.location.hostname}:5000`;
    }
    return 'http://127.0.0.1:5000';
};

export const useAnalysis = () => {
  const { showAlert } = useAlert();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io(getBackendUrl());
    socketRef.current.on('analysis_progress', (data) => {
      setAnalysisProgress(data.message);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const performAnalysis = useCallback(async (activeSymbol: string, activeTimeframe: keyof typeof timeframes) => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      showAlert("Please connect to your MT5 account first.", 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisProgress('Initializing analysis...');

    const credentials = JSON.parse(storedCreds);
    const timeframeValue = timeframes[activeTimeframe];

    try {
        const response = await fetch(`${getBackendUrl()}/api/analyze_single_timeframe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credentials,
                symbol: activeSymbol,
                timeframe: timeframeValue,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "An unknown error occurred during analysis.");
        }

        const data: AnalysisResult = await response.json();
        setAnalysisResult(data);
        setAnalysisProgress('Analysis complete.');

    } catch (error: any) {
        clearInterval(progressInterval);
        showAlert(`Analysis failed: ${error.message}`, 'error');
        setAnalysisProgress('Analysis failed.');
    } finally {
        // Set a timeout to clear the progress message and hide the loading state
        setTimeout(() => {
            setIsAnalyzing(false);
            setAnalysisProgress('');
        }, 2000); // Keep result message visible for 2 seconds
    }
  }, [showAlert]);

  return {
    isAnalyzing,
    analysisResult,
    analysisProgress,
    performAnalysis,
  };
};
