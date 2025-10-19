"use client";

import { createChart, ColorType, CrosshairMode, ISeriesApi, IPriceLine, LineStyle, IChartApi, Time, UTCTimestamp, BusinessDay, SeriesMarker, SeriesMarkerPosition } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';
import { CandlestickData } from '@/lib/alphaVantage';

interface Zone {
    high: number;
    low: number;
    time: Time;
}

// **NEW** Interface for liquidity points
interface LiquidityPoint {
    time: Time;
    price: number;
}

interface Suggestion {
    action: 'Buy' | 'Sell' | 'Neutral';
    entry: number | null;
    sl: number | null;
    tp: number | null;
}

interface CandlestickPattern {
    name: string;
    time: Time;
    position: 'above' | 'below';
    price: number;
}

export const TradingChart = (props: {
    data: CandlestickData[];
    onChartReady: (series: ISeriesApi<"Candlestick">) => void;
    supportLevels?: number[];
    resistanceLevels?: number[];
    demandZones?: Zone[];
    supplyZones?: Zone[];
    bullishOBs?: Zone[];
    bearishOBs?: Zone[];
    bullishFVGs?: Zone[];
    bearishFVGs?: Zone[];
    buySideLiquidity?: LiquidityPoint[]; // Changed from number[]
    sellSideLiquidity?: LiquidityPoint[]; // Changed from number[]
    suggestion?: Suggestion;
    candlestickPatterns?: CandlestickPattern[];
}) => {
    const {
        data, onChartReady, supportLevels, resistanceLevels,
        demandZones, supplyZones, bullishOBs, bearishOBs,
        bullishFVGs, bearishFVGs, buySideLiquidity, sellSideLiquidity,
        suggestion, candlestickPatterns
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

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderDownColor: '#ef5350',
            borderUpColor: '#26a69a', wickDownColor: '#ef5350', wickUpColor: '#26a69a',
            priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
        });

        onChartReady(candlestickSeries);

        // --- 2. DATA & VISUALS ---
        if (data.length > 0) {
            candlestickSeries.setData(data);
            chart.timeScale().fitContent();
        }

        const priceLines: IPriceLine[] = [];
        const drawnRectangles: { remove: () => void }[] = [];

        // --- CANVAS SETUP FOR RECTANGLES ---
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.pointerEvents = 'none'; // Allow mouse events to pass through
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
                const lastVisibleTime = timeScale.getVisibleRange()?.to;
                if (!lastVisibleTime) return;

                const drawZone = (zone: Zone, color: string) => {
                    // Defensively check priceToCoordinate as well, as it can be null if price is out of view
                    const topY = candlestickSeries.priceToCoordinate(zone.high);
                    const bottomY = candlestickSeries.priceToCoordinate(zone.low);
                    const startX = timeScale.timeToCoordinate(zone.time);
                    const endX = timeScale.timeToCoordinate(lastVisibleTime);

                    if (startX === null || endX === null || topY === null || bottomY === null) return;

                    ctx.fillStyle = color;
                    ctx.fillRect(startX, topY, endX - startX, bottomY - topY);
                };

            // Draw Bullish and Bearish Order Blocks
            bullishOBs?.forEach(ob => drawZone(ob, 'rgba(38, 166, 154, 0.2)')); // Teal for Bullish OB
            bearishOBs?.forEach(ob => drawZone(ob, 'rgba(239, 83, 80, 0.2)')); // Red for Bearish OB

            // Also draw FVGs for diagnosis
            bullishFVGs?.forEach(fvg => drawZone(fvg, 'rgba(0, 150, 255, 0.2)')); // Blue for Bullish FVG
            bearishFVGs?.forEach(fvg => drawZone(fvg, 'rgba(128, 0, 128, 0.2)')); // Purple for Bearish FVG
            } catch (e) {
                console.warn("Could not draw rectangles, likely because chart is unmounting or has no data.", e);
            }
        };

        // --- MARKERS & LINES ---
        const drawVisuals = () => {
            // Clear old visuals
            priceLines.forEach(line => candlestickSeries.removePriceLine(line));
            priceLines.length = 0;
            candlestickSeries.setMarkers([]);

            // Draw Liquidity Markers
            const timeToMillis = (t: Time): number => {
                if (typeof t === 'number') {
                    // UTCTimestamp is seconds -> convert to ms
                    return t * 1000;
                }
                // BusinessDay -> convert to UTC ms at midnight
                const bd = t as BusinessDay;
                return Date.UTC(bd.year, bd.month - 1, bd.day);
            };

            const bslMarkers: SeriesMarker<Time>[] = (buySideLiquidity || []).map(l => ({ time: l.time, position: 'aboveBar' as SeriesMarkerPosition, color: '#32CD32', shape: 'circle', size: 1, text: 'BSL' }));
            const sslMarkers: SeriesMarker<Time>[] = (sellSideLiquidity || []).map(l => ({ time: l.time, position: 'belowBar' as SeriesMarkerPosition, color: '#FF4500', shape: 'circle', size: 1, text: 'SSL' }));

            // --- **UPDATED** Pattern Prioritization Logic ---
            const patternPriority: { [key: string]: number } = {
                'ENGULFING': 1,
                'HAMMER': 2, 'HANGINGMAN': 2, 'SHOOTINGSTAR': 2,
                'MORNINGSTAR': 3, 'EVENINGSTAR': 3,
            };
            
            const processedPatterns: { [key: string]: CandlestickPattern } = {};

            (candlestickPatterns || []).forEach(p => {
                const timeKey = JSON.stringify(p.time);
                const existing = processedPatterns[timeKey];
                
                const patternBaseName = p.name.replace('B_', '').replace('S_', '');
                const currentPriority = patternPriority[patternBaseName] || 99;

                // Only process patterns that are in our priority list
                if (!patternPriority[patternBaseName]) {
                    return;
                }

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
                text: p.name.substring(0, 10) // Shorten name
            }));
            // --- End of New Logic ---

            const allMarkers = [...bslMarkers, ...sslMarkers, ...patternMarkers].sort((a, b) => timeToMillis(a.time) - timeToMillis(b.time));
            candlestickSeries.setMarkers(allMarkers);

            // Draw Suggestion Lines
            if (suggestion && suggestion.action !== 'Neutral' && suggestion.entry && suggestion.sl && suggestion.tp) {
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.entry, color: '#FFFFFF', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'Entry' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.sl, color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Stop Loss' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.tp, color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Take Profit' }));
            }

            // Draw rectangles on the canvas
            drawRectangles();
        };

        drawVisuals();

        // --- 3. EVENT LISTENERS ---
        const handleResize = () => {
            chart.applyOptions({
                width: chartContainerRef.current?.clientWidth,
                height: chartContainerRef.current?.clientHeight,
            });
            // Redraw rectangles on resize
            drawRectangles();
        };

        // Redraw rectangles when the visible time range changes (pan/zoom)
        chart.timeScale().subscribeVisibleTimeRangeChange(drawRectangles);

        window.addEventListener('resize', handleResize);

        // --- 4. CLEANUP ---
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.timeScale().unsubscribeVisibleTimeRangeChange(drawRectangles);
            chart.remove();
            // Remove the canvas from the DOM
            if (chartContainerRef.current && canvas.parentNode === chartContainerRef.current) {
                chartContainerRef.current.removeChild(canvas);
            }
        };

    }, [
        data, supportLevels, resistanceLevels, demandZones, supplyZones,
        bullishOBs, bearishOBs, bullishFVGs, bearishFVGs,
        buySideLiquidity, sellSideLiquidity, suggestion, candlestickPatterns,
        onChartReady
    ]);


    return (
        <div ref={chartContainerRef} className="w-full h-full" />
    );
};