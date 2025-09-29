"use client";

import { TradingChart } from "@/components/TradingChart";
import SymbolSearch from "@/components/SymbolSearch";
import { CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi, Time } from "lightweight-charts";

const timeframes = {
  'M1': 'M1',
  'M5': 'M5',
  'M15': 'M15',
  'M30': 'M30',
  '1H': 'H1',
  '4H': 'H4',
  'Daily': 'D1',
  'Weekly': 'W1',
  'Monthly': 'MN1'
};

interface Zone { high: number; low: number; time: Time; }
interface Suggestion { action: 'Buy' | 'Sell' | 'Neutral'; entry: number | null; sl: number | null; tp: number | null; reason: string; }
interface AnalysisResult {
  support: number[];
  resistance: number[];
  demand_zones: Zone[];
  supply_zones: Zone[];
  bullish_ob: Zone[];
  bearish_ob: Zone[];
  suggestion: Suggestion;
  narrative: string;
  confidence: number;
  precautions: string[];
  predicted_success_rate?: string;
}

export default function ChartsPage() {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSymbol, setActiveSymbol] = useState('XAUUSDm');
  const [activeTimeframe, setActiveTimeframe] = useState('Daily');
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const timeframeDropdownRef = useRef<HTMLDivElement>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lotSize, setLotSize] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isTrading, setIsTrading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  
  // --- NEW: State for Auto-Trading ---
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [isTogglingAutoTrade, setIsTogglingAutoTrade] = useState(false);
  const [autoTradeLotSize, setAutoTradeLotSize] = useState('0.01');
  const [confidenceThreshold, setConfidenceThreshold] = useState('75');


  useEffect(() => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (storedCreds) {
      const credentials = JSON.parse(storedCreds);
      fetch('http://127.0.0.1:5000/api/get_all_symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      .then(res => res.ok ? res.json() : Promise.reject('Could not fetch symbols'))
      .then(data => setSymbols(data))
      .catch(error => console.error("Failed to fetch symbols:", error));
    }
  }, []);

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
    setIsLoading(true);
    setAnalysisResult(null); 
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      alert('Please set your MT5 credentials in the Settings page first.');
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
    .then(data => {
      setChartData(data);
      setIsLoading(false);
    })
    .catch(error => {
      console.error("Failed to fetch from backend:", error);
      alert(`Could not load chart data: ${error.error || "Is the Python server running?"}`);
      setChartData([]);
      setIsLoading(false);
    });
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0) return;
    const interval = setInterval(() => {
      const storedCreds = localStorage.getItem('mt5_credentials');
      if (!storedCreds) return;
      const credentials = JSON.parse(storedCreds);
      const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];
      fetch('http://127.0.0.1:5000/api/get_latest_bar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
      })
      .then(res => res.ok ? res.json() : null)
      .then(latestBar => { if (latestBar && seriesRef.current) seriesRef.current.update(latestBar); })
      .catch(error => console.error("Polling error:", error));
    }, 1000); 
    return () => clearInterval(interval);
  }, [chartData, activeSymbol, activeTimeframe]);
  
  useEffect(() => {
    if (analysisResult && analysisResult.suggestion && analysisResult.suggestion.action !== 'Neutral') {
      setStopLoss(analysisResult.suggestion.sl?.toFixed(5) || '');
      setTakeProfit(analysisResult.suggestion.tp?.toFixed(5) || '');
    } else {
      setStopLoss('');
      setTakeProfit('');
    }
  }, [analysisResult]);

  const handleChartReady = useCallback((series: ISeriesApi<"Candlestick">) => {
    seriesRef.current = series;
  }, []);

  const handleAnalysis = () => {
    if (chartData.length < 20) {
      alert("Not enough chart data for analysis.");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    fetch('http://127.0.0.1:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartData: chartData, symbol: activeSymbol }),
    })
    .then(res => res.ok ? res.json() : res.json().then(err => Promise.reject(err)))
    .then((data: AnalysisResult) => setAnalysisResult(data))
    .catch(error => alert(`Analysis failed: ${error.error || "An unknown error."}`))
    .finally(() => setIsAnalyzing(false));
  };

  const handleManualTrade = async (tradeType: 'BUY' | 'SELL') => {
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      alert('Credentials not found. Please save them on the Settings page.');
      return;
    }
    if (parseFloat(lotSize) <= 0) {
      alert('Lot size must be greater than 0.');
      return;
    }
    if (!analysisResult) {
        alert('Please run analysis before placing a trade.');
        return;
    }
    setIsTrading(true);
    try {
      const response = await fetch('http://127.0.0.1:5000/api/execute_trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            ...JSON.parse(storedCreds), 
            symbol: activeSymbol, 
            lot_size: lotSize, 
            trade_type: tradeType, 
            stop_loss: stopLoss, 
            take_profit: takeProfit,
            analysis: analysisResult,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to execute trade.');
      alert(`Success! ${tradeType} order placed and logged. Order ID: ${result.details.order_id}`);
    } catch (error: any) {
      alert(`Trade failed: ${error.message}`);
    } finally {
      setIsTrading(false);
    }
  };
  
  const handleToggleAutoTrade = async () => {
    setIsTogglingAutoTrade(true);
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
        alert('Credentials not found. Please save them on the Settings page.');
        setIsTogglingAutoTrade(false);
        return;
    }

    const endpoint = isAutoTrading ? '/api/stop_autotrade' : '/api/start_autotrade';
    const body = isAutoTrading ? {} : {
        ...JSON.parse(storedCreds),
        symbol: activeSymbol,
        timeframe: timeframes[activeTimeframe as keyof typeof timeframes],
        lot_size: autoTradeLotSize,
        confidence_threshold: confidenceThreshold,
    };

    try {
        const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to toggle auto-trade.');
        
        setIsAutoTrading(!isAutoTrading);
        alert(result.message);

    } catch (error: any) {
        alert(`Error: ${error.message}`);
    } finally {
        setIsTogglingAutoTrade(false);
    }
  };


  const handleTrainModel = async () => {
    setIsTraining(true);
    try {
      const response = await fetch('http://127.0.0.1:5000/api/train');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to train model.');
      alert(result.message || 'Training completed!');
    } catch (error: any) {
      alert(`Training failed: ${error.message}`);
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <main className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 items-center mb-4 gap-4">
            <div className="w-full md:w-64">
              <SymbolSearch symbols={symbols} onSymbolSelect={setActiveSymbol} initialSymbol={activeSymbol} />
            </div>
            <div className="flex justify-end">
              <div className="relative" ref={timeframeDropdownRef}>
                <button onClick={() => setIsTimeframeOpen(!isTimeframeOpen)} className="px-4 py-2 text-sm rounded bg-blue-600 text-white w-24">
                  {activeTimeframe}
                </button>
                {isTimeframeOpen && (
                  <div className="absolute top-full right-0 mt-1 w-24 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-20">
                    {Object.keys(timeframes).map((tfKey) => (
                      <button key={tfKey} onClick={() => { setActiveTimeframe(tfKey); setIsTimeframeOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">
                        {tfKey}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold">Trading Chart for {activeSymbol}</h1>
          </div>
          <div className="relative rounded-md overflow-hidden h-[450px]">
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
                suggestion={analysisResult?.suggestion}
              />
            ) : (
              <div className="flex justify-center items-center h-full"><p className="text-red-400">Could not load data.</p></div>
            )}
          </div>
        </div>
        <div className="md:col-span-1 bg-gray-800 rounded-md p-4 min-h-[600px] flex flex-col">
          <h2 className="text-xl font-bold text-white mb-4">Analysis & Controls</h2>
          <div className="flex gap-2 mb-4">
              <button onClick={handleAnalysis} disabled={isAnalyzing || isLoading} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition-colors disabled:bg-gray-500">
                {isAnalyzing ? 'Analyzing...' : 'Analyze'}
              </button>
              <button onClick={handleTrainModel} disabled={isTraining} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold transition-colors disabled:bg-gray-500">
                {isTraining ? 'Training...' : 'Train AI'}
              </button>
          </div>
          
          {/* NEW: Auto-Trading Panel */}
          <div className='border-t border-b border-gray-700 py-4 my-4'>
            <h3 className="font-bold text-lg text-white mb-3">Auto-Trade Settings</h3>
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-400">Lot Size</label>
                    <input type="number" value={autoTradeLotSize} onChange={(e) => setAutoTradeLotSize(e.target.value)} disabled={isAutoTrading} className="w-full bg-gray-700 rounded p-2 text-sm disabled:opacity-50" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400">Min. Confidence (%)</label>
                    <input type="number" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(e.target.value)} disabled={isAutoTrading} className="w-full bg-gray-700 rounded p-2 text-sm disabled:opacity-50" />
                </div>
                <button onClick={handleToggleAutoTrade} disabled={isTogglingAutoTrade || isLoading} className={`w-full px-4 py-2 rounded text-white font-bold transition-colors disabled:opacity-50 ${isAutoTrading ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                    {isTogglingAutoTrade ? 'Please wait...' : (isAutoTrading ? `STOP AUTO-TRADING (${activeSymbol})` : 'START AUTO-TRADING')}
                </button>
            </div>
          </div>
          
          <div className="mt-4 flex-grow overflow-y-auto">
            {isAnalyzing && <p className="text-gray-400">Performing advanced analysis...</p>}
            {analysisResult && (
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
                    
                    <div>
                        <h3 className="font-bold text-lg text-blue-300">Market Narrative</h3>
                        <p className="text-gray-400 italic">
                            {analysisResult.narrative}
                        </p>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg text-gray-300 mt-3">Precautions</h3>
                        <ul className="list-disc list-inside text-gray-400 text-xs space-y-1">{analysisResult.precautions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </div>
                    
                    {analysisResult.suggestion.action !== 'Neutral' && (
                        <div className="mt-6 border-t border-gray-700 pt-4">
                            <h3 className="font-bold text-lg text-white mb-2">Manual Trade Execution</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Lot Size</label>
                                    <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Stop Loss (Price)</label>
                                    <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Auto-populated by AI" className="w-full bg-gray-700 rounded p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Take Profit (Price)</label>
                                    <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Auto-populated by AI" className="w-full bg-gray-700 rounded p-2 text-sm" />
                                </div>
                                <div className="flex gap-x-2">
                                    <button onClick={() => handleManualTrade('BUY')} disabled={isTrading || analysisResult.suggestion.action !== 'Buy'} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold disabled:bg-gray-500 disabled:cursor-not-allowed">{isTrading ? 'Placing...' : 'BUY'}</button>
                                    <button onClick={() => handleManualTrade('SELL')} disabled={isTrading || analysisResult.suggestion.action !== 'Sell'} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-bold disabled:bg-gray-500 disabled:cursor-not-allowed">{isTrading ? 'Placing...' : 'SELL'}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}