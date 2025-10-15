"use client";

import { TradingChart } from "@/components/TradingChart";
import SymbolSearch from "@/components/SymbolSearch";
import { CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useAlert } from '@/context/AlertContext';
import { io, Socket } from "socket.io-client";


const timeframes = {
  'M1': 'M1', 'M5': 'M5', 'M15': 'M15', 'M30': 'M30', '1H': 'H1',
  '4H': 'H4', 'Daily': 'D1', 'Weekly': 'W1', 'Monthly': 'MN1'
};

const brokerPaths = {
  'Exness': 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe',
  'MetaQuotes': 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
  'Custom': ''
};

interface Zone { high: number; low: number; time: Time; }
interface Suggestion { action: 'Buy' | 'Sell' | 'Neutral'; entry: number | null; sl: number | null; tp: number | null; reason: string; }
interface CandlestickPattern { name: string; time: Time; position: 'above' | 'below'; price: number; }
// **UPDATED**: Narrative is now a structured object
interface Narrative {
  overview: string;
  structure_title: string;
  structure_body: string;
  levels_title: string;
  levels_body: string[];
  prediction_title: string;
  prediction_body: string;
}
interface AnalysisResult {
  support: number[]; resistance: number[]; demand_zones: Zone[];
  supply_zones: Zone[]; bullish_ob: Zone[]; bearish_ob: Zone[];
  bullish_fvg: Zone[]; bearish_fvg: Zone[]; // Added FVGs
  candlestick_patterns: CandlestickPattern[]; suggestion: Suggestion;
  narrative: Narrative; // Updated type
  confidence: number; precautions: string[];
  predicted_success_rate?: string;
}

export default function ChartsPage() {
  const { showAlert } = useAlert();
  
  // Chart and Data State
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('XAUUSDm');
  const [activeTimeframe, setActiveTimeframe] = useState('Daily');
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // UI State
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const timeframeDropdownRef = useRef<HTMLDivElement>(null);
  const [isAutoTradeModalOpen, setIsAutoTradeModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Analysis and Trading State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
    setAnalysisResult(null);
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      setIsLoading(false);
      return;
    }
    const credentials = JSON.parse(storedCreds);
    const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];
    fetch('http://127.0.0.1:5000/api/get_chart_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
    })
    .then(res => res.ok ? res.json() : res.json().then(err => Promise.reject(err)))
    .then(data => { setChartData(data); })
    .catch(error => {
      console.error("Failed to fetch from backend:", error);
      showAlert(`Could not load chart data: ${error.error || "Is the Python server running?"}`, 'error');
      setChartData([]);
    })
    .finally(() => setIsLoading(false));
  }, [activeSymbol, activeTimeframe, showAlert]);

  useEffect(() => {
    const fetchSettingsAndConnect = async () => {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/settings');
            const settings = await response.json();

            if (settings && settings.mt5_credentials && settings.mt5_credentials.login) {
                setMt5Login(settings.mt5_credentials.login);
                setMt5Password(settings.mt5_credentials.password);
                setMt5Server(settings.mt5_credentials.server);
                setMt5TerminalPath(settings.mt5_credentials.terminal_path);

                // This will trigger a connection attempt on the backend
                const symbolsResponse = await fetch('http://127.0.0.1:5000/api/get_all_symbols', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings.mt5_credentials)
                });

                if (symbolsResponse.ok) {
                    const newSymbols = await symbolsResponse.json();
                    setSymbols(newSymbols);
                    setIsConnected(true);
                } else {
                    setIsConnected(false);
                }
            }
        } catch (error) {
            console.error("Failed to fetch settings:", error);
            setIsConnected(false);
        }
    };
    fetchSettingsAndConnect();
  }, []);

  useEffect(() => { if (isConnected) { fetchChartData(); } }, [isConnected, fetchChartData]);
  
  useEffect(() => {
    if (isConnected) {
        socketRef.current = io('http://127.0.0.1:5000');
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
        const response = await fetch('http://127.0.0.1:5000/api/get_all_symbols', {
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
    setSymbols([]); setChartData([]); setAnalysisResult(null);
    showAlert('Disconnected from MT5.', 'info');
  };

  const handleAnalysis = () => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      showAlert("Please connect to your MT5 account first.", 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    const credentials = JSON.parse(storedCreds);

    // Using the new multi-timeframe endpoint
    fetch('http://127.0.0.1:5000/api/analyze_multi_timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            credentials,
            symbol: activeSymbol,
            trading_style: 'DAY_TRADING' // Or get this from settings
        }),
    })
    .then(res => res.ok ? res.json() : res.json().then(err => Promise.reject(err)))
    .then(data => {
        // We need to adapt the new response format to the old state structure
        // For now, we'll just display the primary suggestion's narrative
        const primaryTimeframe = Object.keys(data.individual_analyses)[0];
        const primaryAnalysis = data.individual_analyses[primaryTimeframe];

        const adaptedResult = {
            ...primaryAnalysis,
            confidence: data.final_confidence === 'HIGH' ? 90 : (data.final_confidence === 'MEDIUM' ? 65 : 40),
            suggestion: {
                ...data.primary_suggestion,
                reason: `Confidence: ${data.final_confidence}. Action: ${data.final_action}. ` + data.primary_suggestion.reason,
            },
            narrative: data.narratives[primaryTimeframe],
            precautions: ["This is an AI-generated suggestion, not financial advice.", "Always perform your own due diligence."],
        };
        setAnalysisResult(adaptedResult);
    })
    .catch(error => showAlert(`Analysis failed: ${error.error || "An unknown error."}`, 'error'))
    .finally(() => setIsAnalyzing(false));
  };

  const handleManualTrade = async (tradeType: 'BUY' | 'SELL') => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) { showAlert('You are not connected to MT5.', 'error'); return; }
    if (parseFloat(lotSize) <= 0) { showAlert('Lot size must be greater than 0.', 'error'); return; }
    if (!analysisResult) { showAlert('Please run analysis before placing a trade.', 'error'); return; }
    setIsTrading(true);
    try {
      const response = await fetch('http://127.0.0.1:5000/api/execute_trade', {
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
        const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
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
              />
            ) : (
              <div className="flex justify-center items-center h-full"><p className="text-red-400">{isConnected ? "Could not load data." : "Please connect to your MT5 account."}</p></div>
            )}
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
            {isAnalyzing && <p className="text-gray-400">Performing advanced analysis...</p>}
            {analysisResult ? (
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
                        <h3 className="font-bold text-lg text-yellow-300">AI Suggestion</h3>
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
                        <div>
                            <p className="font-semibold text-gray-200">{analysisResult.narrative.prediction_title}</p>
                            <p className="text-gray-400 italic">{analysisResult.narrative.prediction_body}</p>
                        </div>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-gray-300 mt-3">Precautions</h3>
                        <ul className="list-disc list-inside text-gray-400 text-xs space-y-1">{analysisResult.precautions.map((p, i) => <li key={i}>{p}</li>)}</ul>
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