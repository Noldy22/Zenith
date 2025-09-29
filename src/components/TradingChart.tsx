"use client";

import { createChart, ColorType, CrosshairMode, ISeriesApi } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';
import { CandlestickData } from '@/lib/alphaVantage';

export const TradingChart = (props: {
    data: CandlestickData[];
    onChartReady: (series: ISeriesApi<"Candlestick">) => void;
}) => {
    const { data, onChartReady } = props;
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current || data.length === 0) {
            return;
        }

        const handleResize = () => {
            chart.applyOptions({
                width: chartContainerRef.current!.clientWidth,
            });
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#131722' },
                textColor: '#D9D9D9',
            },
            grid: {
                vertLines: { color: '#2A2E39' },
                horzLines: { color: '#2A2E39' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            rightPriceScale: {
                visible: true,
                borderColor: '#485158',
            },
            timeScale: {
                borderColor: '#485158',
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
            priceFormat: {
                type: 'price',
                precision: 5,
                minMove: 0.00001,
            },
        });

        candlestickSeries.setData(data);
        onChartReady(candlestickSeries);

        chart.timeScale().fitContent();

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, onChartReady]); // Simplified dependencies

    return <div ref={chartContainerRef} className="w-full h-full" />;
};