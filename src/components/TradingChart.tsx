"use client";

import { createChart, ColorType, CrosshairMode, ISeriesApi, IPriceLine, LineStyle, IChartApi, Time, UTCTimestamp, BusinessDay, SeriesMarker, SeriesMarkerPosition, LogicalRange } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';
import { CandlestickData } from '../lib/alphaVantage'; // Adjusted path

// Interface definitions remain the same...
interface Zone { high: number; low: number; time: Time; }
interface LiquidityPoint { time: Time; price: number; }
interface Divergence { type: 'Bullish' | 'Bearish'; time: Time; price: number; }
interface EmaCross { type: 'Golden Cross' | 'Death Cross'; time: Time; price: number; }
interface Suggestion { action: 'Buy' | 'Sell' | 'Neutral'; entry: number | null; sl: number | null; tp: number | null; }
interface CandlestickPattern { name: string; time: Time; position: 'above' | 'below'; price: number; }

export const TradingChart = (props: {
    data: CandlestickData[];
    onChartReady: (chart: IChartApi) => void;
    onSeriesReady: (series: ISeriesApi<"Candlestick">) => void;
    supportLevels?: number[];
    resistanceLevels?: number[];
    demandZones?: Zone[]; // Already present
    supplyZones?: Zone[]; // Already present
    bullishOBs?: Zone[];
    bearishOBs?: Zone[];
    bullishFVGs?: Zone[];
    bearishFVGs?: Zone[];
    buySideLiquidity?: LiquidityPoint[];
    sellSideLiquidity?: LiquidityPoint[];
    suggestion?: Suggestion;
    candlestickPatterns?: CandlestickPattern[];
    rsiDivergences?: Divergence[];
    emaCrosses?: EmaCross[];
}) => {
    const {
        data, onChartReady, onSeriesReady, supportLevels, resistanceLevels,
        demandZones, supplyZones, // Keep these
        bullishOBs, bearishOBs,
        bullishFVGs, bearishFVGs, buySideLiquidity, sellSideLiquidity,
        suggestion, candlestickPatterns, rsiDivergences, emaCrosses
    } = props;

    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) {
            return;
        }

        // --- 1. SETUP ---
        const chart = createChart(chartContainerRef.current, {
            layout: { background: { type: ColorType.Solid, color: '#1A1A1A' }, textColor: '#F5F5F5' },
            grid: { vertLines: { color: '#2A2A2A' }, horzLines: { color: '#2A2A2A' } },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { visible: true, borderColor: '#3A3A3A' },
            timeScale: { borderColor: '#3A3A3A', timeVisible: true, },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        });
        onChartReady(chart);


        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderDownColor: '#ef5350',
            borderUpColor: '#26a69a', wickDownColor: '#ef5350', wickUpColor: '#26a69a',
            priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
        });

        onSeriesReady(candlestickSeries);

        // --- 2. DATA & VISUALS ---
        if (data.length > 0) {
            candlestickSeries.setData(data);

            const lastBarIndex = data.length - 1;
            const firstVisibleIndex = Math.max(0, lastBarIndex - 100);

            chart.timeScale().setVisibleLogicalRange({
                from: firstVisibleIndex,
                to: lastBarIndex
            });
        }

        const priceLines: IPriceLine[] = [];

        // --- CANVAS SETUP FOR RECTANGLES ---
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.pointerEvents = 'none';
        chartContainerRef.current.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        const drawRectangles = () => {
            if (!ctx) return;

            try {
                const chartWidth = chartContainerRef.current?.clientWidth ?? 0;
                const chartHeight = chartContainerRef.current?.clientHeight ?? 0;
                canvas.width = chartWidth;
                canvas.height = chartHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const timeScale = chart.timeScale();
                const visibleRange = timeScale.getVisibleLogicalRange();
                if (!visibleRange || data.length === 0) return;

                const lastDataIndex = data.length - 1;
                const lastDataTime = data[lastDataIndex].time;

                const drawZone = (zone: Zone, color: string) => {
                    const topY = candlestickSeries.priceToCoordinate(zone.high);
                    const bottomY = candlestickSeries.priceToCoordinate(zone.low);
                    const startX = timeScale.timeToCoordinate(zone.time);
                    // Extend zone to the end of the chart data
                    const endX = timeScale.timeToCoordinate(lastDataTime);

                    if (startX === null || endX === null || topY === null || bottomY === null) return;

                    // Ensure startX is not beyond endX, and coordinates are within chart bounds
                    const visibleEndX = Math.min(endX, chartWidth); // Don't draw past chart edge
                    if (startX <= visibleEndX && startX < chartWidth && topY < chartHeight && bottomY > 0) {
                        ctx.fillStyle = color;
                        // Clip drawing to visible chart area horizontally
                        const drawStartX = Math.max(startX, 0);
                        const drawWidth = visibleEndX - drawStartX;
                        if (drawWidth > 0) {
                           ctx.fillRect(drawStartX, topY, drawWidth, bottomY - topY);
                        }
                    }
                };

                // --- MODIFICATION START: Draw Supply/Demand Zones ---
                // Draw Supply Zones (Red, slightly transparent)
                supplyZones?.forEach(zone => drawZone(zone, 'rgba(239, 83, 80, 0.15)')); // Slightly transparent red
                // Draw Demand Zones (Green, slightly transparent)
                demandZones?.forEach(zone => drawZone(zone, 'rgba(38, 166, 154, 0.15)')); // Slightly transparent green
                // --- MODIFICATION END ---

                // Draw Order Blocks (using existing colors, slightly more opaque for distinction if needed)
                bullishOBs?.forEach(ob => drawZone(ob, 'rgba(38, 166, 154, 0.2)')); // Teal
                bearishOBs?.forEach(ob => drawZone(ob, 'rgba(239, 83, 80, 0.2)')); // Red

                // Draw FVGs
                bullishFVGs?.forEach(fvg => drawZone(fvg, 'rgba(0, 150, 255, 0.15)')); // Blue
                bearishFVGs?.forEach(fvg => drawZone(fvg, 'rgba(128, 0, 128, 0.15)')); // Purple

            } catch (e) {
                console.warn("Could not draw rectangles.", e);
            }
        };

        // --- MARKERS & LINES (No changes needed here) ---
        const drawVisuals = () => {
            priceLines.forEach(line => candlestickSeries.removePriceLine(line));
            priceLines.length = 0;
            candlestickSeries.setMarkers([]);

            const timeToMillis = (t: Time): number => {
                if (typeof t === 'number') return t * 1000;
                const bd = t as BusinessDay;
                return Date.UTC(bd.year, bd.month - 1, bd.day);
            };

            const bslMarkers: SeriesMarker<Time>[] = (buySideLiquidity || []).map(l => ({ time: l.time, position: 'aboveBar' as SeriesMarkerPosition, color: '#32CD32', shape: 'circle', size: 1, text: 'BSL' }));
            const sslMarkers: SeriesMarker<Time>[] = (sellSideLiquidity || []).map(l => ({ time: l.time, position: 'belowBar' as SeriesMarkerPosition, color: '#FF4500', shape: 'circle', size: 1, text: 'SSL' }));

            const rsiDivMarkers: SeriesMarker<Time>[] = (rsiDivergences || []).map(d => ({
                time: d.time,
                position: d.type === 'Bearish' ? 'aboveBar' : 'belowBar',
                color: d.type === 'Bearish' ? '#FF00FF' : '#00FFFF',
                shape: d.type === 'Bearish' ? 'arrowDown' : 'arrowUp',
                text: d.type.substring(0, 4) + ' Div'
            }));

            const emaCrossMarkers: SeriesMarker<Time>[] = (emaCrosses || []).map(c => ({
                time: c.time,
                position: 'inBar',
                color: c.type === 'Golden Cross' ? '#FFD700' : '#808080',
                shape: 'circle',
                text: c.type
            }));

            const patternPriority: { [key: string]: number } = {
                'ENGULFING': 1, 'HAMMER': 2, 'HANGINGMAN': 2, 'SHOOTINGSTAR': 2,
                'MORNINGSTAR': 3, 'EVENINGSTAR': 3,
            };
            const processedPatterns: { [key: string]: CandlestickPattern } = {};
            (candlestickPatterns || []).forEach(p => {
                const timeKey = JSON.stringify(p.time);
                const existing = processedPatterns[timeKey];
                const patternBaseName = p.name.replace('B_', '').replace('S_', '');
                const currentPriority = patternPriority[patternBaseName] || 99;
                if (!patternPriority[patternBaseName]) return;
                if (!existing) {
                    processedPatterns[timeKey] = { ...p, name: patternBaseName };
                } else {
                    const existingBaseName = existing.name.replace('B_', '').replace('S_', '');
                    const existingPriority = patternPriority[existingBaseName] || 99;
                    if (currentPriority < existingPriority) {
                        processedPatterns[timeKey] = { ...p, name: patternBaseName };
                    }
                }
            });
            const patternMarkers: SeriesMarker<Time>[] = Object.values(processedPatterns).map(p => ({
                time: p.time,
                position: (p.position === 'above' ? 'aboveBar' : 'belowBar') as SeriesMarkerPosition,
                color: p.name.startsWith('B_') ? '#26a69a' : '#ef5350',
                shape: p.position === 'below' ? 'arrowUp' : 'arrowDown',
                text: p.name.substring(0, 10)
            }));

            const allMarkers = [...bslMarkers, ...sslMarkers, ...patternMarkers, ...rsiDivMarkers, ...emaCrossMarkers].sort((a, b) => timeToMillis(a.time) - timeToMillis(b.time));
            candlestickSeries.setMarkers(allMarkers);

            if (suggestion && suggestion.action !== 'Neutral' && suggestion.entry && suggestion.sl && suggestion.tp) {
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.entry, color: '#FFFFFF', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'Entry' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.sl, color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Stop Loss' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.tp, color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Take Profit' }));
            }

            drawRectangles(); // Draw rectangles after markers/lines
        };

        drawVisuals(); // Initial draw

        // --- 3. EVENT LISTENERS ---
        const handleResize = () => {
            chart.applyOptions({
                width: chartContainerRef.current?.clientWidth,
                height: chartContainerRef.current?.clientHeight,
            });
            // Need to redraw rectangles on resize as coordinates change
            drawRectangles();
        };

        // Redraw rectangles whenever the visible time range changes (pan/zoom)
        chart.timeScale().subscribeVisibleLogicalRangeChange(drawRectangles);
        window.addEventListener('resize', handleResize);

        // --- 4. CLEANUP ---
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(drawRectangles);
            chart.remove();
            if (chartContainerRef.current && canvas.parentNode === chartContainerRef.current) {
                chartContainerRef.current.removeChild(canvas);
            }
        };

    // Dependency array includes demandZones and supplyZones now
    }, [
        data, supportLevels, resistanceLevels, demandZones, supplyZones,
        bullishOBs, bearishOBs, bullishFVGs, bearishFVGs,
        buySideLiquidity, sellSideLiquidity, suggestion, candlestickPatterns,
        rsiDivergences, emaCrosses,
        onChartReady, onSeriesReady
    ]);


    return (
        <div ref={chartContainerRef} className="w-full h-full" />
    );
};