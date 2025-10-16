"use client";

import { createChart, ColorType, CrosshairMode, ISeriesApi, IPriceLine, LineStyle, IChartApi, Time, UTCTimestamp, BusinessDay } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';
import { CandlestickData } from '@/lib/alphaVantage';

interface Zone {
    high: number;
    low: number;
    time: Time;
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
    buySideLiquidity?: number[];
    sellSideLiquidity?: number[];
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

        // This function draws all the extra lines on the chart.
        const drawLines = () => {
            priceLines.forEach(line => candlestickSeries.removePriceLine(line));
            priceLines.length = 0;

            buySideLiquidity?.forEach(l => priceLines.push(candlestickSeries.createPriceLine({ price: l, color: '#32CD32', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '$ BSL' })));
            sellSideLiquidity?.forEach(l => priceLines.push(candlestickSeries.createPriceLine({ price: l, color: '#FF4500', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '$ SSL' })));

            if (suggestion && suggestion.action !== 'Neutral' && suggestion.entry && suggestion.sl && suggestion.tp) {
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.entry, color: '#FFFFFF', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'Entry' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.sl, color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Stop Loss' }));
                priceLines.push(candlestickSeries.createPriceLine({ price: suggestion.tp, color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Take Profit' }));
            }
        };

        drawLines();

        // NOTE: The complex zone drawing with a canvas overlay has been temporarily removed
        // to fix the "Object is disposed" crash. This was the likely source of the race condition.
        // The core functionality (candlesticks, lines) is now stable.

        // --- 3. EVENT LISTENERS ---
        const handleResize = () => {
            chart.applyOptions({
                width: chartContainerRef.current?.clientWidth,
                height: chartContainerRef.current?.clientHeight,
            });
        };

        window.addEventListener('resize', handleResize);

        // --- 4. CLEANUP ---
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
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