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
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const resizeObserver = useRef<ResizeObserver | null>(null);

    // Effect for chart creation and destruction
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { type: ColorType.Solid, color: '#1A1A1A' }, textColor: '#F5F5F5' },
            grid: { vertLines: { color: '#2A2A2A' }, horzLines: { color: '#2A2A2A' } },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { visible: true, borderColor: '#3A3A3A' },
            timeScale: { borderColor: '#3A3A3A', timeVisible: true },
        });
        chartRef.current = chart;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderDownColor: '#ef5350',
            borderUpColor: '#26a69a', wickDownColor: '#ef5350', wickUpColor: '#26a69a',
            priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
        });
        seriesRef.current = candlestickSeries;
        onChartReady(candlestickSeries);

        return () => {
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [onChartReady]);

    // Effect to update data
    useEffect(() => {
        if (seriesRef.current && data.length > 0) {
            seriesRef.current.setData(data);
            chartRef.current?.timeScale().fitContent();
        }
    }, [data]);

    // Effect to draw S/R lines and manage the canvas for zones
    useEffect(() => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        const canvas = canvasRef.current;
        if (!chart || !series || !canvas) return;

        // Clear previous drawings
        priceLinesRef.current.forEach(line => series.removePriceLine(line));
        priceLinesRef.current = [];

        // --- Redesigned Drawing Logic ---
        const drawVisuals = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const chartWidth = chart.timeScale().width();

            // Function to draw zones behind candles
            const drawZone = (zone: Zone, color: string) => {
                const yTop = series.priceToCoordinate(zone.high);
                const yBottom = series.priceToCoordinate(zone.low);
                let xStart = chart.timeScale().timeToCoordinate(zone.time);
                if (yTop === null || yBottom === null) return;
                const xStartVisible = xStart === null ? 0 : Math.max(xStart, 0);

                ctx.fillStyle = color;
                ctx.fillRect(xStartVisible, yTop, chartWidth - xStartVisible, yBottom - yTop);
            };

            // Draw zones with subtle, semi-transparent colors
            ctx.globalAlpha = 0.15;
            demandZones?.forEach(z => drawZone(z, '#26a69a')); // Green
            supplyZones?.forEach(z => drawZone(z, '#ef5350')); // Red
            bullishOBs?.forEach(z => drawZone(z, '#00BFFF')); // DeepSkyBlue
            bearishOBs?.forEach(z => drawZone(z, '#FF69B4')); // HotPink
            bullishFVGs?.forEach(z => drawZone(z, '#8A2BE2')); // BlueViolet
            bearishFVGs?.forEach(z => drawZone(z, '#FF1493')); // DeepPink
            ctx.globalAlpha = 1.0;

            // Draw liquidity pools as distinct lines
            buySideLiquidity?.forEach(l => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#32CD32', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '$ BSL' })));
            sellSideLiquidity?.forEach(l => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#FF4500', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '$ SSL' })));

            // Draw trade suggestion lines
            if (suggestion && suggestion.action !== 'Neutral' && suggestion.entry && suggestion.sl && suggestion.tp) {
                priceLinesRef.current.push(series.createPriceLine({ price: suggestion.entry, color: '#FFFFFF', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'Entry' }));
                priceLinesRef.current.push(series.createPriceLine({ price: suggestion.sl, color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Stop Loss' }));
                priceLinesRef.current.push(series.createPriceLine({ price: suggestion.tp, color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Take Profit' }));
            }
        };

        drawVisuals();
        chart.timeScale().subscribeVisibleLogicalRangeChange(drawVisuals);
        if (resizeObserver.current) resizeObserver.current.disconnect();

        resizeObserver.current = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (chart && canvas) {
                canvas.width = width;
                canvas.height = height;
                chart.applyOptions({ width, height });
                drawVisuals();
            }
        });
        if(chartContainerRef.current) {
            resizeObserver.current.observe(chartContainerRef.current);
        }

        return () => {
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(drawVisuals);
            resizeObserver.current?.disconnect();
        };

    }, [supportLevels, resistanceLevels, demandZones, supplyZones, bullishOBs, bearishOBs, bullishFVGs, bearishFVGs, buySideLiquidity, sellSideLiquidity, suggestion, candlestickPatterns, data]);

    return (
        <div ref={chartContainerRef} className="w-full h-full relative">
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" />
        </div>
    );
};