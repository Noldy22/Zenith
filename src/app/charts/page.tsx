"use client";
// Adjusted imports to use relative paths
import { useAnalysis } from '../../hooks/useAnalysis';
import { TradingChart } from "../../components/TradingChart";
import ScanningLineAnimation from "../../components/ScanningLineAnimation"; // Use the new animation
import SymbolSearch from "../../components/SymbolSearch";
import Chat from "../../components/Chat";
import { CandlestickData } from "../../lib/alphaVantage"; // Adjusted path
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi, Time, IChartApi, CandlestickData as LightweightCandlestickData } from "lightweight-charts"; // Import LightweightCandlestickData
import { useAlert } from '../../context/AlertContext'; // Adjusted path
import { io, Socket } from "socket.io-client";

// --- UI Component Imports (using relative paths) ---
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../../components/ui/dialog";

// --- Core Imports (using relative paths) ---
import { getBackendUrl } from '../../lib/utils';
// FIX: Changed AppSettings to Settings
import { timeframes, AnalysisResult, Settings } from '../../lib/types';
import { LogIn, LogOut, Settings as SettingsIcon, Bot, Zap } from 'lucide-react'; // Renamed Settings icon import
import { useAppSettings } from '@/hooks/useAppSettings'; // Import useAppSettings

const brokerPaths = {
  'Exness': 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe',
  'MetaQuotes': 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
  'Custom': ''
};

export default function ChartsPage() {
  const { showAlert } = useAlert();
  // --- Use App Settings Hook ---
  const { settings, isLoading: settingsLoading, isSaving: settingsSaving, saveSettings } = useAppSettings();

  // Chart and Data State
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false); // Renamed isLoading
  const [activeSymbol, setActiveSymbol] = useState('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState('1H');
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [series, setSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // UI State
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const { isAnalyzing, analysisResult, analysisProgress, performAnalysis, clearAnalysis, setAnalysisProgress } = useAnalysis();
  const [lotSize, setLotSize] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isTrading, setIsTrading] = useState(false);

  // MT5 Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5TerminalPath, setMt5TerminalPath] = useState(brokerPaths['Exness']);
  const [brokerSelection, setBrokerSelection] = useState<keyof typeof brokerPaths>('Exness');

  // Derive auto-trade status for the current symbol
  const isAutoTradingSymbol = settings.auto_trading_enabled && settings.pairs_to_trade.includes(activeSymbol);

  const fetchChartData = useCallback(() => {
    setIsLoadingChart(true); // Use renamed state
    clearAnalysis();
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      setIsLoadingChart(false);
      return;
    }
    const credentials = JSON.parse(storedCreds);
    const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];
    const backendUrl = getBackendUrl(); // Get URL
    const fetchUrl = `${backendUrl}/api/get_chart_data`;
    console.log("ChartsPage (fetchChartData) fetching from:", fetchUrl); // <<< ADDED LOGGING
    fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => Promise.reject(err));
        }
        return res.json();
    })
    .then(data => {
        console.log(`[CHARTS] Fetched ${data.length} bars for ${activeSymbol}`);
        const formattedData = data.map((d: any) => ({
          ...d,
          time: d.time as Time
        }));
        setChartData(formattedData);
    })
    .catch(error => {
      console.error("[CHARTS] Error fetching chart data:", error);
      console.error("[CHARTS] Failed URL was:", fetchUrl); // <<< ADDED LOGGING
      showAlert(`Could not load chart data: ${error.error || "Is the Python server running?"}`, 'error');
      setChartData([]);
    })
    .finally(() => setIsLoadingChart(false)); // Use renamed state
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

                const backendUrl = getBackendUrl(); // Get URL
                const fetchUrl = `${backendUrl}/api/get_all_symbols`;
                console.log("ChartsPage (checkConnection) fetching from:", fetchUrl); // <<< ADDED LOGGING
                const symbolsResponse = await fetch(fetchUrl, {
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
                    console.error("Failed URL was:", fetchUrl); // <<< ADDED LOGGING
                }
            } catch (error) {
                console.error("Error during initial connection check:", error);
                // Log the URL that might have failed if it was constructed
                const backendUrl = getBackendUrl();
                const failedUrl = `${backendUrl}/api/get_all_symbols`;
                console.error("Failed URL during checkConnection catch:", failedUrl); // <<< ADDED LOGGING
                setIsConnected(false);
            }
        } else {
            setIsConnected(false);
        }
    };
    checkConnection();
  }, []); // Keep dependency array empty to run only once on mount

  useEffect(() => { if (isConnected) { fetchChartData(); } }, [isConnected, fetchChartData]);

  useEffect(() => {
    if (isConnected) {
        // Use getBackendUrl() for socket connection as well
        const backendUrlForSocket = getBackendUrl();
        console.log("Connecting socket to:", backendUrlForSocket);
        socketRef.current = io(backendUrlForSocket); // Use the function here
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
            const formattedBar = { ...bar, time: bar.time as Time };
            if (seriesRef.current) {
                seriesRef.current.update(formattedBar as LightweightCandlestickData<'Candlestick'>);
            }
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

  const handleChartReady = useCallback((chart: IChartApi) => { setChart(chart) }, []);
  const handleSeriesReady = useCallback((series: ISeriesApi<"Candlestick">) => {
    setSeries(series);
    seriesRef.current = series;
   }, []);

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
    const backendUrl = getBackendUrl();
    const connectUrl = `${backendUrl}/api/get_all_symbols`;
    console.log("ChartsPage (handleConnect) posting to:", connectUrl); // Log connect URL
    try {
        const response = await fetch(connectUrl, {
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
                showAlert(`Symbol ${activeSymbol} not found. Switched to default: ${defaultSymbol}`, 'info');
            }
        }
    } catch (error: any) {
        console.error("Failed connection URL was:", connectUrl); // Log failed connect URL
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

    const backendUrl = getBackendUrl();
    const tradeUrl = `${backendUrl}/api/execute_trade`;
    console.log("ChartsPage (handleManualTrade) posting to:", tradeUrl); // Log trade URL

    try {
      const response = await fetch(tradeUrl, {
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
      console.error("Failed trade URL was:", tradeUrl); // Log failed trade URL
      showAlert(`Trade failed: ${error.message}`, 'error');
    } finally { setIsTrading(false); }
  };

  const handleToggleAutoTradeForSymbol = async () => {
    if (!isConnected) {
      showAlert('Please connect to MT5 first.', 'error');
      return;
    }

    const currentPairs = settings.pairs_to_trade || [];
    let newPairs: string[];
    let newAutoTradingEnabled = settings.auto_trading_enabled;

    if (isAutoTradingSymbol) {
      // --- Disable for this symbol ---
      newPairs = currentPairs.filter(pair => pair !== activeSymbol);
      if (newPairs.length === 0) {
        newAutoTradingEnabled = false;
        showAlert(`Auto-trading disabled for ${activeSymbol}. Global auto-trading stopped as no symbols are selected.`, 'info');
      } else {
        showAlert(`Auto-trading disabled for ${activeSymbol}.`, 'info');
      }
    } else {
      // --- Enable for this symbol ---
      if (!currentPairs.includes(activeSymbol)) {
        newPairs = [...currentPairs, activeSymbol];
      } else {
        newPairs = currentPairs; // Already there, just ensure global is on
      }
      if (!newAutoTradingEnabled) {
        newAutoTradingEnabled = true;
        showAlert(`Auto-trading enabled for ${activeSymbol}. Global auto-trading started.`, 'success');
      } else {
         showAlert(`Auto-trading enabled for ${activeSymbol}.`, 'success');
      }
    }

    // Use the saveSettings function from the hook
    const success = await saveSettings({
      auto_trading_enabled: newAutoTradingEnabled,
      pairs_to_trade: newPairs,
    });
  };

  // Helper component to render analysis content
  const AnalysisContent = () => (
    <>
      {isAnalyzing && !analysisResult && (
        <div className="text-center p-4">
          <p className="text-lg text-primary font-semibold animate-pulse">{analysisProgress || 'Analyzing...'}</p>
          <p className="text-sm text-muted-foreground mt-2">Please wait, AI is at work...</p>
        </div>
      )}
      {analysisResult && (
        <div className="space-y-4 text-sm p-6 pt-0 lg:p-0 lg:pt-0"> {/* Adjusted padding */}
           {analysisResult.predicted_success_rate && (
               <div>
                   <h3 className="font-bold text-lg text-purple-400">Predicted Success Rate</h3>
                   <p className="font-semibold text-lg text-white">{analysisResult.predicted_success_rate}</p>
               </div>
           )}
           <div>
               <h3 className="font-bold text-lg text-muted-foreground">Confidence</h3>
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
                   <h3 className="font-bold text-lg text-white mb-2">Manual Trade Execution</h3>
                   <div className="space-y-3">
                       <div>
                           <Label htmlFor="lot-size-manual">Lot Size</Label>
                           <Input id="lot-size-manual" type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
                       </div>
                       <div>
                           <Label htmlFor="sl-manual">Stop Loss (Price)</Label>
                           <Input id="sl-manual" type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Auto-populated by AI" />
                       </div>
                       <div>
                           <Label htmlFor="tp-manual">Take Profit (Price)</Label>
                           <Input id="tp-manual" type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Auto-populated by AI" />
                       </div>
                       <div className="flex gap-x-2">
                           <Button onClick={() => handleManualTrade('BUY')} disabled={isTrading || analysisResult.suggestion.action !== 'Buy'} className="flex-1 bg-green-600 hover:bg-green-700 font-bold">
                             {isTrading ? 'Placing...' : 'BUY'}
                           </Button>
                           <Button onClick={() => handleManualTrade('SELL')} disabled={isTrading || analysisResult.suggestion.action !== 'Sell'} className="flex-1 bg-red-600 hover:bg-red-700 font-bold">
                             {isTrading ? 'Placing...' : 'SELL'}
                           </Button>
                       </div>
                   </div>
               </div>
           )}
        </div>
      )}
      {!analysisResult && !isAnalyzing && (
         <div className="hidden lg:flex flex-col items-center justify-center text-center text-muted-foreground flex-grow">
           <p>{isConnected ? 'Click "Analyze" above to get AI insights.' : 'Connect your MT5 account to begin.'}</p>
         </div>
      )}
    </>
  );


  return (
    <main className="p-4 sm:p-6 lg:p-8">
      {/* MT5 Connect Modal */}
      <Dialog open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen}>
         <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect MT5 Account</DialogTitle>
            <DialogDescription>
              Enter your credentials to connect to your broker.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="login">Login ID</Label>
              <Input id="login" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={mt5Password} onChange={(e) => setMt5Password(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server">Server</Label>
              <Input id="server" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broker">Broker</Label>
              <Select onValueChange={(val) => handleBrokerSelection(val as keyof typeof brokerPaths)} value={brokerSelection}>
                <SelectTrigger id="broker">
                  <SelectValue placeholder="Select broker..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(brokerPaths).map(broker => <SelectItem key={broker} value={broker}>{broker}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {brokerSelection === 'Custom' && (
              <div className="space-y-2">
                <Label htmlFor="path">Terminal Path</Label>
                <Input id="path" value={mt5TerminalPath} onChange={(e) => setMt5TerminalPath(e.target.value)} placeholder="C:\Program Files\...\terminal64.exe" />
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Page Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column (Chart, Controls, Mobile Analysis, Chat) */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            {/* Top Controls Card */}
            <CardContent className="p-4 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
              {/* Instrument & Timeframe */}
              <div className="w-full sm:w-auto flex items-center gap-2 order-2 sm:order-1">
                 <div className="flex-grow">
                   <SymbolSearch symbols={symbols} onSymbolSelect={setActiveSymbol} initialSymbol={activeSymbol} />
                 </div>
                 <Select onValueChange={(value) => setActiveTimeframe(value)} value={activeTimeframe}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(timeframes).map((tfKey) => (
                        <SelectItem key={tfKey} value={tfKey}>{tfKey}</SelectItem>
                      ))}
                    </SelectContent>
                 </Select>
              </div>
              {/* Connection Status & Buttons */}
              <div className="w-full sm:w-auto flex flex-wrap items-center justify-between sm:justify-start gap-2 order-1 sm:order-2">
                <div className={`flex items-center gap-2 border px-3 py-2 rounded-md text-sm ${isConnected ? 'border-green-500/50' : 'border-red-500/50'}`}>
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className={`${isConnected ? 'text-green-400' : 'text-red-400'}`}>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                {isConnected ? (
                  <Button variant="destructive" size="sm" onClick={handleDisconnect}><LogOut className="w-4 h-4 mr-1 sm:mr-2" />Disconnect</Button>
                ) : (
                  <Button size="sm" onClick={() => setIsConnectModalOpen(true)}><LogIn className="w-4 h-4 mr-1 sm:mr-2" />Connect MT5</Button>
                )}
                <Button
                  variant={isAutoTradingSymbol ? "default" : "secondary"}
                  size="sm"
                  onClick={handleToggleAutoTradeForSymbol}
                  disabled={!isConnected || settingsLoading || settingsSaving}
                >
                  <Bot className={`w-4 h-4 mr-1 sm:mr-2 ${isAutoTradingSymbol ? 'text-green-400' : ''}`} />
                  {isAutoTradingSymbol ? `Auto: ${activeSymbol}` : 'Auto-Trade'}
                </Button>
                <Button size="sm" onClick={handleAnalysis} disabled={isAnalyzing || !isConnected || settingsSaving} className="flex-grow sm:flex-grow-0 lg:hidden inline-flex">
                  <Zap className="w-4 h-4 mr-1 sm:mr-2" />
                  {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <h1 className="text-3xl font-bold text-center">{activeSymbol} Chart</h1>

          <Card className="h-[450px] p-0">
            <div className="relative rounded-md overflow-hidden h-full w-full">
              {isAnalyzing && (
                <div className="absolute inset-0 bg-primary/10 animate-pulse pointer-events-none z-[9]"></div>
              )}
              <ScanningLineAnimation
                 chart={chart}
                 series={series}
                 isAnalyzing={isAnalyzing}
                 candleData={chartData}
              />
              {isLoadingChart ? (
                <div className="flex justify-center items-center h-full"><p className="text-gray-400">Loading chart data...</p></div>
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
                />
              ) : (
                <div className="flex justify-center items-center h-full"><p className="text-red-400">{isConnected ? "Could not load data." : "Please connect to your MT5 account."}</p></div>
              )}
            </div>
          </Card>

          {/* Conditional Mobile Analysis Card */}
          {analysisResult && (
            <Card className="block lg:hidden">
              <CardHeader className="pt-6 pb-0"> {/* Adjusted padding */}
                 {/* Optionally add title: <CardTitle>Analysis Results</CardTitle> */}
              </CardHeader>
              <CardContent className="p-0">
                <AnalysisContent />
              </CardContent>
            </Card>
          )}

          {/* Chat Section */}
          {analysisResult && (
             <div className="h-[400px] mt-4"> {/* Added margin-top */}
                <Chat analysisContext={analysisResult} />
             </div>
          )}
        </div>

        {/* Right Column (Analysis & Controls - For Desktop View) */}
        <div className="lg:col-span-1 space-y-4 hidden lg:block">
          <Card className="flex flex-col min-h-[600px]">
            <CardHeader className="pt-6 pb-0"> {/* Adjusted padding */}
              {/* Title Removed */}
            </CardHeader>
            <CardContent className="flex-grow flex flex-col">
              {/* Analyze Button */}
              <div className="flex gap-2 mb-4">
                  <Button onClick={handleAnalysis} disabled={isAnalyzing || !isConnected || settingsSaving} className="w-full">
                    <Zap className="w-4 h-4 mr-2" />
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </Button>
              </div>
              {/* Analysis Content */}
              <div className="flex-grow overflow-y-auto">
                 <AnalysisContent />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}