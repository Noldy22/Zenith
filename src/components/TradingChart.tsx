"use client"; // This component uses client-side features

import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';

export const TradingChart = (props: { data: any[] }) => {
    const { data } = props;
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
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
            width: chartContainerRef.current.clientWidth,
            height: 500,
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
        });

        candlestickSeries.setData(data);
        chart.timeScale().fitContent();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data]);

    return <div ref={chartContainerRef} className="w-full h-[500px] rounded-md" />;
};