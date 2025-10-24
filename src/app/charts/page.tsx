"use client";
import { useAnalysis } from '@/hooks/useAnalysis';
import { TradingChart } from "@/components/TradingChart";
import CandleHighlightAnimation from "@/components/CandleHighlightAnimation";
import SymbolSearch from "@/components/SymbolSearch";
import Chat from "@/components/Chat";
import { CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi, Time, IChartApi } from "lightweight-charts";
import { useAlert } from '@/context/AlertContext';
import { io, Socket } from "socket.io-client";
import { timeframes, AnalysisResult } from '@/lib/types';
import { getBackendUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { BarChart2, Bot, Power, PowerOff, X } from 'lucide-react';

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
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [series, setSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // UI State
  const [isAutoTradeModalOpen, setIsAutoTradeModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const { isAnalyzing, analysisResult, analysisProgress, performAnalysis, clearAnalysis, setAnalysisProgress } = useAnalysis();
  
  // Trade State
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

  // --- DATA FETCHING & SOCKETS ---
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
        if (!res.ok) { return res.json().then(err => Promise.reject(err)); }
        return res.json();
    })
    .then(data => { setChartData(data); })
    .catch(error => {
      console.error("Error fetching chart data:", error);
      showAlert(`Could not load chart data: ${error.error || "Is the Python server running?"}`, 'error');
      setChartData([]);
    })
    .finally(() => setIsLoading(false));
  }, [activeSymbol, activeTimeframe, showAlert, clearAnalysis]);

  useEffect(() => {
    const checkConnection = async () => {
        const storedCreds = localStorage.getItem('mt5_credentials');
        if (storedCreds) {
            try {
                const credentials = JSON.parse(storedCreds);
                setMt5Login(String(credentials.login));
                setMt5Password(credentials.password);
                setMt5Server(credentials.server);
                setMt5TerminalPath(credentials.terminal_path);
                
                const symbolsResponse = await fetch(`${getBackendUrl()}/api/get_all_symbols`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials)
                });

                if (symbolsResponse.ok) {
                    const newSymbols = await symbolsResponse.json();
                    setSymbols(newSymbols);
                    setIsConnected(true);
                } else {
                    setIsConnected(false);
                    console.error("Initial connection check failed.");
                }
            } catch (error) {
                console.error("Error during initial connection check:", error);
                setIsConnected(false);
            }
        } else {
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
            if (seriesRef.current) { seriesRef.current.update(bar); }
        });
        socketRef.current.on('training_complete', (data) => {
            showAlert(data.message, 'success');
        });
        socketRef.current.on('analysis_progress', (data) => {
            setAnalysisProgress(data.message);
        });
        return () => {
            socketRef.current?.disconnect();
        };
    }
}, [isConnected, activeSymbol, activeTimeframe, showAlert, setAnalysisProgress]);

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

  // --- CHART CALLBACKS ---
  const handleChartReady = useCallback((chart: IChartApi) => { setChart(chart) }, []);
  const handleSeriesReady = useCallback((series: ISeriesApi<"Candlestick">) => {
    setSeries(series);
    seriesRef.current = series;
   }, []);

  // --- MODAL & BUTTON HANDLERS ---
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
                showAlert(`Symbol ${activeSymbol} not found. Switched to ${defaultSymbol}`, 'info');
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
    <main className="p-4 sm:p-6 lg:p-8">
      {/* --- Connect Modal --- */}
      <Dialog open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect MT5 Account</DialogTitle>
            <DialogDescription>
              Enter your credentials to connect to your MetaTrader 5 account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mt5-login">Login ID</Label>
              <Input id="mt5-login" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt5-password">Password</Label>
              <Input id="mt5-password" type="password" value={mt5Password} onChange={(e) => setMt5Password(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt5-server">Server</Label>
              <Input id="mt5-server" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt5-broker">Broker</Label>
              <Select onValueChange={(value) => handleBrokerSelection(value as keyof typeof brokerPaths)} value={brokerSelection}>
                <SelectTrigger id="mt5-broker">
                  <SelectValue placeholder="Select broker..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(brokerPaths).map(broker => <SelectItem key={broker} value={broker}>{broker}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {brokerSelection === 'Custom' && (
              <div className="space-y-2">
                <Label htmlFor="mt5-path">Terminal Path</Label>
                <Input id="mt5-path" value={mt5TerminalPath} onChange={(e) => setMt5TerminalPath(e.target.value)} placeholder="C:\Program Files\...\terminal64.exe" />
              </div>
            )}
          </div>
          <DialogFooter className="sm:flex-col sm:space-x-0 sm:space-y-2">
            <Button onClick={handleConnect} disabled={isConnecting} className="w-full">
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="w-full">
                Cancel
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Auto-Trade Modal --- */}
      <Dialog open={isAutoTradeModalOpen} onOpenChange={setIsAutoTradeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Auto-Trade Settings</DialogTitle>
            <DialogDescription>
              Configure and activate automated trading for {activeSymbol}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
              <div className="space-y-2">
                  <Label htmlFor="auto-lot-size">Lot Size</Label>
                  <Input id="auto-lot-size" type="number" value={autoTradeLotSize} onChange={(e) => setAutoTradeLotSize(e.target.value)} disabled={isAutoTrading} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="auto-confidence">Min. Confidence (%)</Label>
                  <Input id="auto-confidence" type="number" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(e.target.value)} disabled={isAutoTrading} />
              </div>
          </div>
          <DialogFooter className="sm:flex-col sm:space-x-0 sm:space-y-2">
              <Button 
                onClick={handleToggleAutoTrade} 
                disabled={isTogglingAutoTrade || isLoading} 
                className={`w-full ${isAutoTrading ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700'} text-white`}
              >
                  {isTogglingAutoTrade ? 'Please wait...' : (isAutoTrading ? `STOP AUTO-TRADING` : 'START AUTO-TRADING')}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="w-full">
                  Cancel
                </Button>
              </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Main Page Content --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* --- Left Column (Chart & Chat) --- */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="w-full md:w-auto md:min-w-[200px]">
                  <SymbolSearch symbols={symbols} onSymbolSelect={setActiveSymbol} initialSymbol={activeSymbol} />
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className="flex items-center gap-2 bg-secondary p-2 rounded-md">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-xs font-semibold">{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                  {isConnected ? (
                    <Button onClick={handleDisconnect} variant="destructive" size="sm">
                      <PowerOff className="h-4 w-4 mr-1" /> Disconnect
                    </Button>
                  ) : (
                    <Button onClick={() => setIsConnectModalOpen(true)} variant="outline" size="sm">
                      <Power className="h-4 w-4 mr-1" /> Connect MT5
                    </Button>
                  )}
                  <div className="w-24">
                    <Select value={activeTimeframe} onValueChange={(value) => setActiveTimeframe(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(timeframes).map((tfKey) => (
                          <SelectItem key={tfKey} value={tfKey}>{tfKey}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={() => setIsAutoTradeModalOpen(true)} 
                    disabled={!isConnected} 
                    variant={isAutoTrading ? "default" : "secondary"}
                    size="sm"
                    className={isAutoTrading ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                  >
                    <Bot className="h-4 w-4 mr-1" />
                    {isAutoTrading ? 'Auto-Trading Active' : 'Auto-Trade'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative h-[450px]">
            <CandleHighlightAnimation
              chart={chart}
              series={series}
              isAnalyzing={isAnalyzing}
              candleData={chartData}
            />
            {isLoading ? (
              <div className="flex justify-center items-center h-full"><p className="text-muted-foreground">Loading chart data...</p></div>
            ) : chartData.length > 0 ? (
              <TradingChart
                data={chartData}
                onChartReady={handleChartReady}
                onSeriesReady={handleSeriesReady}
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
                rsiDivergences={analysisResult?.rsi_divergence}
                emaCrosses={analysisResult?.ema_crosses}
              />
            ) : (
              <div className="flex justify-center items-center h-full"><p className="text-red-400">{isConnected ? "Could not load data." : "Please connect to your MT5 account."}</p></div>
            )}
          </Card>
          
          <div className="h-[400px]">
             {analysisResult && <Chat analysisContext={analysisResult} />}
          </div>
        </div>

        {/* --- Right Column (Analysis & Controls) --- */}
        <Card className="md:col-span-1 min-h-[600px] flex flex-col">
          <CardHeader>
            <CardTitle className="text-xl">Analysis & Controls</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col">
              <Button onClick={handleAnalysis} disabled={isAnalyzing || !isConnected} className="w-full">
                <BarChart2 className="h-4 w-4 mr-2" />
                {isAnalyzing ? 'Analyzing...' : `Analyze ${activeSymbol}`}
              </Button>
            
            <div className="mt-4 flex-grow overflow-y-auto space-y-4">
              {isAnalyzing && (
                <div className="text-center p-4">
                  <p className="text-lg text-primary font-semibold animate-pulse">{analysisProgress}</p>
                  <p className="text-sm text-muted-foreground mt-2">Please wait, AI is at work...</p>
                </div>
              )}
              {analysisResult && !isAnalyzing ? (
                  <div className="space-y-4 text-sm">
                      {analysisResult.predicted_success_rate && (
                          <div>
                              <h3 className="font-bold text-lg text-purple-400">Predicted Success Rate</h3>
                              <p className="font-semibold text-lg text-foreground">{analysisResult.predicted_success_rate}</p>
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
                          <h3 className="font-bold text-lg text-primary">Trade Rationale</h3>
                          <p className="text-muted-foreground">{analysisResult.suggestion.reason}</p>
                      </div>
                      <div className="space-y-3">
                          <h3 className="font-bold text-lg text-blue-300">{analysisResult.narrative.overview}</h3>
                          <div>
                              <p className="font-semibold text-foreground">{analysisResult.narrative.structure_title}</p>
                              <p className="text-muted-foreground italic">{analysisResult.narrative.structure_body}</p>
                          </div>
                          <div>
                              <p className="font-semibold text-foreground">{analysisResult.narrative.levels_title}</p>
                              <ul className="list-disc list-inside text-muted-foreground italic">
                                  {analysisResult.narrative.levels_body && analysisResult.narrative.levels_body.map((item, index) => <li key={index}>{item}</li>)}
                              </ul>
                          </div>
                      </div>
                      {analysisResult.suggestion.action !== 'Neutral' && (
                          <div className="mt-6 border-t border-border pt-4">
                              <h3 className="font-bold text-lg text-foreground mb-2">Manual Trade Execution</h3>
                              <div className="space-y-3">
                                  <div className="space-y-2">
                                      <Label htmlFor="manual-lot">Lot Size</Label>
                                      <Input id="manual-lot" type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                      <Label htmlFor="manual-sl">Stop Loss (Price)</Label>
                                      <Input id="manual-sl" type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Auto-populated by AI" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label htmlFor="manual-tp">Take Profit (Price)</Label>
                                      <Input id="manual-tp" type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Auto-populated by AI" />
                                  </div>
                                  <div className="flex gap-x-2">
                                      <Button 
                                        onClick={() => handleManualTrade('BUY')} 
                                        disabled={isTrading || analysisResult.suggestion.action !== 'Buy'} 
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                      >
                                        {isTrading ? 'Placing...' : 'BUY'}
                                      </Button>
                                      <Button 
                                        onClick={() => handleManualTrade('SELL')} 
                                        disabled={isTrading || analysisResult.suggestion.action !== 'Sell'} 
                                        className="flex-1"
                                        variant="destructive"
                                      >
                                        {isTrading ? 'Placing...' : 'SELL'}
                                      </Button>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="text-center text-muted-foreground mt-10">
                    <p>{isConnected ? 'Click "Analyze" to get AI insights.' : 'Connect your MT5 account to begin.'}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
