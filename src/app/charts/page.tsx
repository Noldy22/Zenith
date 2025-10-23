"use client";

import { useAnalysis } from '@/hooks/useAnalysis';
import { TradingChart } from "@/components/TradingChart";
import ChartAnimation from "@/components/ChartAnimation";
import SymbolSearch from "@/components/SymbolSearch";
import Chat from "@/components/Chat"; // Import the new Chat component
import { CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useAlert } from '@/context/AlertContext';
import { io, Socket } from "socket.io-client";

const getBackendUrl = () => {
    if (typeof window !== 'undefined') {
        return `http://${window.location.hostname}:5000`;
    }
    return 'http://127.0.0.1:5000'; // Default for server-side rendering
};

import { timeframes, AnalysisResult } from '@/lib/types';

const brokerPaths = {
  'Exness': 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe',
  'MetaQuotes': 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
  'Custom': ''
};

export default function ChartsPage() {
  const { showAlert } = useAlert();
  
  // Chart and Data State
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState('1H');
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // UI State
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const timeframeDropdownRef = useRef<HTMLDivElement>(null);
  const [isAutoTradeModalOpen, setIsAutoTradeModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const { isAnalyzing, analysisResult, analysisProgress, performAnalysis, clearAnalysis, setAnalysisProgress } = useAnalysis();
  const [lotSize, setLotSize] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isTrading, setIsTrading] = useState(false);

  // Auto-Trading State
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [isTogglingAutoTrade, setIsTogglingAutoTrade] = useState(false);
  const [autoTradeLotSize, setAutoTradeLotSize] = useState('0.01');
  const [confidenceThreshold, setConfidenceThreshold] = useState('75');

  // MT5 Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5TerminalPath, setMt5TerminalPath] = useState(brokerPaths['Exness']);
  const [brokerSelection, setBrokerSelection] = useState<keyof typeof brokerPaths>('Exness');

  const fetchChartData = useCallback(() => {
    setIsLoading(true);
    clearAnalysis();
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      setIsLoading(false);
      return;
    }
    const credentials = JSON.parse(storedCreds);
    const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];
    fetch(`${getBackendUrl()}/api/get_chart_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
    })
    .then(res => {
        if (!res.ok) {
            // If response is not OK, get the error body and reject
            return res.json().then(err => Promise.reject(err));
        }
        // If response is OK, clone it so we can log it and still use it
        const clonedRes = res.clone();
        clonedRes.json().then(data => {
            console.log("--- [FRONTEND LOG] Raw data received from /api/get_chart_data ---");
            console.log(`Received ${data.length} items.`);
            console.log("Sample of received data:", data.slice(0, 5));
            console.log("---------------------------------------------------------------");
        });
        return res.json();
    })
    .then(data => { setChartData(data); })
    .catch(error => {
      console.error("--- [FRONTEND LOG] Error fetching chart data ---");
      console.error(error);
      console.log("-----------------------------------------------");
      showAlert(`Could not load chart data: ${error.error || "Is the Python server running?"}`, 'error');
      setChartData([]);
    })
    .finally(() => setIsLoading(false));
  }, [activeSymbol, activeTimeframe, showAlert]);

  useEffect(() => {
    const checkConnection = async () => {
        // Use the definitive credentials from localStorage, not server settings
        const storedCreds = localStorage.getItem('mt5_credentials');
        if (storedCreds) {
            try {
                const credentials = JSON.parse(storedCreds);
                setMt5Login(String(credentials.login));
                setMt5Password(credentials.password);
                setMt5Server(credentials.server);
                setMt5TerminalPath(credentials.terminal_path);

                // Attempt to connect and get symbols using the correct credentials
                const symbolsResponse = await fetch(`${getBackendUrl()}/api/get_all_symbols`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials)
                });

                if (symbolsResponse.ok) {
                    const newSymbols = await symbolsResponse.json();
                    setSymbols(newSymbols);
                    setIsConnected(true); // SUCCESS: Connection confirmed
                } else {
                    // This is a likely failure point if creds are bad
                    setIsConnected(false);
                    console.error("Initial connection check failed, server might be down or credentials invalid.");
                }
            } catch (error) {
                console.error("Error during initial connection check:", error);
                setIsConnected(false);
            }
        } else {
            // No credentials stored, so definitely not connected.
            setIsConnected(false);
        }
    };
    checkConnection();
  }, []);

  useEffect(() => { if (isConnected) { fetchChartData(); } }, [isConnected, fetchChartData]);
  
  useEffect(() => {
    if (isConnected) {
        socketRef.current = io(getBackendUrl());
        socketRef.current.on('connect', () => {
            console.log('Socket connected!');
            const storedCreds = localStorage.getItem('mt5_credentials');
            if (storedCreds) {
                socketRef.current?.emit('subscribe_to_chart', {
                    symbol: activeSymbol,
                    timeframe: timeframes[activeTimeframe as keyof typeof timeframes],
                    credentials: JSON.parse(storedCreds)
                });
            }
        });
        socketRef.current.on('new_bar', (bar: CandlestickData) => { if (seriesRef.current) { seriesRef.current.update(bar); } });
        socketRef.current.on('training_complete', (data) => { showAlert(data.message, 'success'); });
        return () => { socketRef.current?.disconnect(); };
    }
  }, [isConnected, activeSymbol, activeTimeframe, showAlert]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timeframeDropdownRef.current && !timeframeDropdownRef.current.contains(event.target as Node)) {
        setIsTimeframeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const suggestion = analysisResult?.suggestion;
    if (suggestion && suggestion.action !== 'Neutral') {
        setStopLoss(suggestion.sl?.toFixed(5) || '');
        setTakeProfit(suggestion.tp?.toFixed(5) || '');
    } else {
        setStopLoss('');
        setTakeProfit('');
    }
  }, [analysisResult]);

  useEffect(() => {
    if (isConnected) {
        socketRef.current = io(getBackendUrl());

        socketRef.current.on('connect', () => {
            console.log('Socket connected for chart updates and analysis!');
            const storedCreds = localStorage.getItem('mt5_credentials');
            if (storedCreds) {
                socketRef.current?.emit('subscribe_to_chart', {
                    symbol: activeSymbol,
                    timeframe: timeframes[activeTimeframe as keyof typeof timeframes],
                    credentials: JSON.parse(storedCreds)
                });
            }
        });

        socketRef.current.on('new_bar', (bar: CandlestickData) => {
            if (seriesRef.current) {
                seriesRef.current.update(bar);
            }
        });

        socketRef.current.on('training_complete', (data) => {
            showAlert(data.message, 'success');
        });

        // New listener for analysis progress
        socketRef.current.on('analysis_progress', (data) => {
            setAnalysisProgress(data.message);
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }
}, [isConnected, activeSymbol, activeTimeframe, showAlert]);

  const handleChartReady = useCallback((series: ISeriesApi<"Candlestick">) => { seriesRef.current = series; }, []);

  const handleBrokerSelection = (broker: keyof typeof brokerPaths) => {
    setBrokerSelection(broker);
    if (broker !== 'Custom') {
      setMt5TerminalPath(brokerPaths[broker]);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    const credentials = {
      login: parseInt(mt5Login, 10),
      password: mt5Password,
      server: mt5Server,
      terminal_path: mt5TerminalPath
    };
    try {
        const response = await fetch(`${getBackendUrl()}/api/get_all_symbols`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to connect.');
        
        const newSymbols: string[] = result;
        localStorage.setItem('mt5_credentials', JSON.stringify(credentials));
        setSymbols(newSymbols);
        setIsConnected(true);
        setIsConnectModalOpen(false);
        showAlert('Successfully connected to MT5!', 'success');

        if (!newSymbols.includes(activeSymbol)) {
            const defaultSymbol = newSymbols.find(s => s.toUpperCase() === 'EURUSD') || newSymbols[0];
            if (defaultSymbol) {
                setActiveSymbol(defaultSymbol);
                showAlert(`Symbol ${activeSymbol} not found on this server. Switched to default: ${defaultSymbol}`, 'info');
            }
        }
    } catch (error: any) {
        showAlert(`Connection failed: ${error.message}`, 'error');
    } finally {
        setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('mt5_credentials');
    setIsConnected(false);
    setSymbols([]);
    setChartData([]);
    clearAnalysis();
    showAlert('Disconnected from MT5.', 'info');
  };

  const handleAnalysis = () => {
    performAnalysis(activeSymbol, activeTimeframe as keyof typeof timeframes);
  };

  const handleManualTrade = async (tradeType: 'BUY' | 'SELL') => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) { showAlert('You are not connected to MT5.', 'error'); return; }
    if (parseFloat(lotSize) <= 0) { showAlert('Lot size must be greater than 0.', 'error'); return; }
    if (!analysisResult) { showAlert('Please run analysis before placing a trade.', 'error'); return; }
    setIsTrading(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/execute_trade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...JSON.parse(storedCreds), symbol: activeSymbol, lot_size: lotSize, trade_type: tradeType,
            stop_loss: stopLoss, take_profit: takeProfit, analysis: analysisResult,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to execute trade.');
      showAlert(`Success! ${tradeType} order placed. Order ID: ${result.details.order_id}`, 'success');
    } catch (error: any) {
      showAlert(`Trade failed: ${error.message}`, 'error');
    } finally { setIsTrading(false); }
  };
  
  const handleToggleAutoTrade = async () => {
    setIsTogglingAutoTrade(true);
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
        showAlert('Credentials not found. Please connect your account first.', 'error');
        setIsTogglingAutoTrade(false); return;
    }
    const endpoint = isAutoTrading ? '/api/stop_autotrade' : '/api/start_autotrade';
    const body = isAutoTrading ? {} : {
        ...JSON.parse(storedCreds), symbol: activeSymbol,
        timeframe: timeframes[activeTimeframe as keyof typeof timeframes],
        lot_size: autoTradeLotSize, confidence_threshold: confidenceThreshold,
    };
    try {
        const response = await fetch(`${getBackendUrl()}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to toggle auto-trade.');
        setIsAutoTrading(!isAutoTrading);
        showAlert(result.message, 'success');
        if (!isAutoTrading) setIsAutoTradeModalOpen(false);
    } catch (error: any) {
        showAlert(`Error: ${error.message}`, 'error');
    } finally { setIsTogglingAutoTrade(false); }
  };

  return (
    <main className="p-4">
      {isConnectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-secondary p-8 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="font-bold text-2xl text-white mb-6 text-center">Connect MT5 Account</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400">Login ID</label>
                <input type="text" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">Password</label>
                <input type="password" value={mt5Password} onChange={(e) => setMt5Password(e.target.value)} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">Server</label>
                <input type="text" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">Broker</label>
                <select onChange={(e) => handleBrokerSelection(e.target.value as keyof typeof brokerPaths)} value={brokerSelection} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary">
                    {Object.keys(brokerPaths).map(broker => <option key={broker} value={broker}>{broker}</option>)}
                </select>
              </div>
              {brokerSelection === 'Custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-400">Terminal Path</label>
                  <input type="text" value={mt5TerminalPath} onChange={(e) => setMt5TerminalPath(e.target.value)} placeholder="C:\Program Files\...\terminal64.exe" className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
              <button onClick={handleConnect} disabled={isConnecting} className="w-full px-4 py-3 bg-primary hover:bg-yellow-600 rounded-lg text-background font-bold text-lg transition-colors disabled:opacity-50">
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
              <button onClick={() => setIsConnectModalOpen(false)} className="w-full mt-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-bold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isAutoTradeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-secondary p-8 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="font-bold text-2xl text-white mb-6">Auto-Trade Settings</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400">Lot Size</label>
                    <input type="number" value={autoTradeLotSize} onChange={(e) => setAutoTradeLotSize(e.target.value)} disabled={isAutoTrading} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400">Min. Confidence (%)</label>
                    <input type="number" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(e.target.value)} disabled={isAutoTrading} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
                </div>
                <button onClick={handleToggleAutoTrade} disabled={isTogglingAutoTrade || isLoading} className={`w-full px-4 py-3 rounded-lg text-background font-bold text-lg transition-colors disabled:opacity-50 ${isAutoTrading ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                    {isTogglingAutoTrade ? 'Please wait...' : (isAutoTrading ? `STOP AUTO-TRADING (${activeSymbol})` : 'START AUTO-TRADING')}
                </button>
                 <button onClick={() => setIsAutoTradeModalOpen(false)} className="w-full mt-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-bold transition-colors">
                    Cancel
                </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
            <div className="w-full sm:w-auto">
              <SymbolSearch symbols={symbols} onSymbolSelect={setActiveSymbol} initialSymbol={activeSymbol} />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-secondary p-1 rounded-md">
                 <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className="text-xs font-semibold">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {isConnected ? (
                 <button onClick={handleDisconnect} className="px-3 py-2 text-xs rounded-md bg-red-600 text-white hover:bg-red-700">Disconnect</button>
              ) : (
                 <button onClick={() => setIsConnectModalOpen(true)} className="px-3 py-2 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700">Connect MT5</button>
              )}
              <div className="relative" ref={timeframeDropdownRef}>
                <button onClick={() => setIsTimeframeOpen(!isTimeframeOpen)} className="px-4 py-2 text-sm rounded-md bg-secondary text-white w-24 hover:bg-gray-700">
                  {activeTimeframe}
                </button>
                {isTimeframeOpen && (
                  <div className="absolute top-full right-0 mt-1 w-24 bg-secondary border border-border rounded-md shadow-lg z-20">
                    {Object.keys(timeframes).map((tfKey) => (
                      <button key={tfKey} onClick={() => { setActiveTimeframe(tfKey); setIsTimeframeOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-600">
                        {tfKey}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setIsAutoTradeModalOpen(true)} disabled={!isConnected} className={`px-4 py-2 text-sm rounded-md font-semibold ${isAutoTrading ? 'bg-green-500 text-white' : 'bg-secondary text-white hover:bg-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                {isAutoTrading ? 'Auto-Trading Active' : 'Auto-Trade'}
              </button>
            </div>
          </div>
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold">Trading Chart for {activeSymbol}</h1>
          </div>
          <div className="relative rounded-md overflow-hidden h-[450px] bg-secondary">
            <ChartAnimation isAnalyzing={isAnalyzing} />
            {isLoading ? (
              <div className="flex justify-center items-center h-full"><p className="text-gray-400">Loading chart data...</p></div>
            ) : chartData.length > 0 ? (
              <TradingChart
                data={chartData}
                onChartReady={handleChartReady}
                supportLevels={analysisResult?.support}
                resistanceLevels={analysisResult?.resistance}
                demandZones={analysisResult?.demand_zones}
                supplyZones={analysisResult?.supply_zones}
                bullishOBs={analysisResult?.bullish_ob}
                bearishOBs={analysisResult?.bearish_ob}
                bullishFVGs={analysisResult?.bullish_fvg}
                bearishFVGs={analysisResult?.bearish_fvg}
                buySideLiquidity={analysisResult?.buy_side_liquidity}
                sellSideLiquidity={analysisResult?.sell_side_liquidity}
                suggestion={analysisResult?.suggestion}
                candlestickPatterns={analysisResult?.candlestick_patterns}
                
              />
            ) : (
              <div className="flex justify-center items-center h-full"><p className="text-red-400">{isConnected ? "Could not load data." : "Please connect to your MT5 account."}</p></div>
            )}
          </div>
          {/* New Chat Section */}
          <div className="mt-4 h-[400px]">
             {analysisResult && <Chat analysisContext={analysisResult} />}
          </div>
        </div>
        <div className="md:col-span-1 bg-secondary rounded-xl p-4 min-h-[600px] flex flex-col shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Analysis & Controls</h2>
            <div className="flex gap-2 mb-4">
                <button onClick={handleAnalysis} disabled={isAnalyzing} className="w-full px-4 py-2 bg-primary hover:bg-yellow-600 rounded-md text-background font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                  {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                </button>
            </div>
          <div className="mt-4 flex-grow overflow-y-auto">
            {isAnalyzing && (
              <div className="text-center p-4">
                <p className="text-lg text-yellow-400 font-semibold animate-pulse">{analysisProgress}</p>
                <p className="text-sm text-gray-500 mt-2">Please wait, AI is at work...</p>
              </div>
            )}
            {analysisResult && !isAnalyzing ? (
                <div className="space-y-4 text-sm">
                    {analysisResult.predicted_success_rate && (
                        <div>
                            <h3 className="font-bold text-lg text-purple-400">Predicted Success Rate</h3>
                            <p className="font-semibold text-lg text-white">{analysisResult.predicted_success_rate}</p>
                        </div>
                    )}
                    <div>
                        <h3 className="font-bold text-lg text-gray-300">Confidence</h3>
                        <p className={`font-semibold text-2xl ${
                            analysisResult.confidence > 75 ? 'text-green-400'
                            : analysisResult.confidence >= 50 ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}>
                            {analysisResult.confidence.toFixed(0)}%
                        </p>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-yellow-300">Trade Rationale</h3>
                        <p className="text-gray-300">{analysisResult.suggestion.reason}</p>
                    </div>
                    {/* **UPDATED NARRATIVE DISPLAY** */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-lg text-blue-300">{analysisResult.narrative.overview}</h3>
                        <div>
                            <p className="font-semibold text-gray-200">{analysisResult.narrative.structure_title}</p>
                            <p className="text-gray-400 italic">{analysisResult.narrative.structure_body}</p>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-200">{analysisResult.narrative.levels_title}</p>
                            <ul className="list-disc list-inside text-gray-400 italic">
                                {analysisResult.narrative.levels_body && analysisResult.narrative.levels_body.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                        </div>
                    </div>
                    {analysisResult.suggestion.action !== 'Neutral' && (
                        <div className="mt-6 border-t border-border pt-4">
                            <h3 className="font-bold text-lg text-white mb-2">Manual Trade Execution</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Lot Size</label>
                                    <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Stop Loss (Price)</label>
                                    <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Auto-populated by AI" className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Take Profit (Price)</label>
                                    <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Auto-populated by AI" className="w-full mt-1 bg-gray-900 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div className="flex gap-x-2">
                                    <button onClick={() => handleManualTrade('BUY')} disabled={isTrading || analysisResult.suggestion.action !== 'Buy'} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold disabled:bg-gray-500 disabled:cursor-not-allowed">{isTrading ? 'Placing...' : 'BUY'}</button>
                                    <button onClick={() => handleManualTrade('SELL')} disabled={isTrading || analysisResult.suggestion.action !== 'Sell'} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-bold disabled:bg-gray-500 disabled:cursor-not-allowed">{isTrading ? 'Placing...' : 'SELL'}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                 <div className="text-center text-gray-500 mt-10">
                    <p>{isConnected ? 'Click "Analyze" to get AI insights.' : 'Connect your MT5 account to begin.'}</p>
                </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}