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

        priceLinesRef.current.forEach(line => series.removePriceLine(line));
        priceLinesRef.current = [];

        supportLevels?.forEach((l, i) => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed, title: `S${i + 1}` })));
        resistanceLevels?.forEach((l, i) => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed, title: `R${i + 1}` })));

        const drawVisuals = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const drawZoneWithLabel = (zone: Zone, color: string, label: string, transparency: number) => {
                const yTop = series.priceToCoordinate(zone.high);
                const yBottom = series.priceToCoordinate(zone.low);
                const xStart = chart.timeScale().timeToCoordinate(zone.time);
                if (yTop === null || yBottom === null || xStart === null) return;

                const chartWidth = chart.timeScale().width();
                ctx.globalAlpha = transparency;
                ctx.fillStyle = color;
                ctx.fillRect(xStart, yTop, chartWidth - xStart, yBottom - yTop);

                ctx.globalAlpha = 1.0;
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "12px sans-serif";
                ctx.fillText(label, xStart + 5, yTop + 15);
            };

            const drawSuggestionTool = (sugg: Suggestion) => {
                if (sugg.action === 'Neutral' || !sugg.entry || !sugg.sl || !sugg.tp || data.length === 0) return;

                const entryY = series.priceToCoordinate(sugg.entry);
                const slY = series.priceToCoordinate(sugg.sl);
                const tpY = series.priceToCoordinate(sugg.tp);
                if (entryY === null || slY === null || tpY === null) return;

                const timeScale = chart.timeScale();
                const logicalRange = timeScale.getVisibleLogicalRange();
                if (!logicalRange) return;

                const lastBar = data[data.length - 1];
                const entryX = timeScale.timeToCoordinate(lastBar.time);
                if (entryX === null) return;

                const toolWidth = 100;

                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#ef5350';
                ctx.fillRect(entryX, entryY, toolWidth, slY - entryY);

                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#26a69a';
                ctx.fillRect(entryX, entryY, toolWidth, tpY - entryY);
            }
            
            demandZones?.forEach(z => drawZoneWithLabel(z, '#26a69a', 'Demand', 0.2));
            supplyZones?.forEach(z => drawZoneWithLabel(z, '#ef5350', 'Supply', 0.2));
            bullishOBs?.forEach(z => drawZoneWithLabel(z, '#00BFFF', 'Bullish OB', 0.35));
            bearishOBs?.forEach(z => drawZoneWithLabel(z, '#FF69B4', 'Bearish OB', 0.35));
            bullishFVGs?.forEach(z => drawZoneWithLabel(z, '#8A2BE2', 'Bullish FVG', 0.25));
            bearishFVGs?.forEach(z => drawZoneWithLabel(z, '#FF1493', 'Bearish FVG', 0.25));

            buySideLiquidity?.forEach(l => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#32CD32', lineWidth: 1, lineStyle: LineStyle.Solid, title: 'BSL' })));
            sellSideLiquidity?.forEach(l => priceLinesRef.current.push(series.createPriceLine({ price: l, color: '#FF4500', lineWidth: 1, lineStyle: LineStyle.Solid, title: 'SSL' })));

            if(suggestion) drawSuggestionTool(suggestion);
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