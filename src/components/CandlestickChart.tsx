"use client";

import { createChart, ColorType } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

const CandlestickChart = ({ credentials, symbol, timeframe }) => {
    const chartContainerRef = useRef();
    const chartRef = useRef();

    useEffect(() => {
        if (!credentials || !credentials.login) return;

        const handleResize = () => {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        };

        chartRef.current = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#1f2937' },
                textColor: '#d1d5db',
            },
            grid: {
                vertLines: { color: '#374151' },
                horzLines: { color: '#374151' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
        });

        const candleSeries = chartRef.current.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderDownColor: '#ef4444',
            borderUpColor: '#22c55e',
            wickDownColor: '#ef4444',
            wickUpColor: '#22c55e',
        });

        // Fetch initial data
        const fetchChartData = async () => {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/get_chart_data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...credentials, symbol, timeframe }),
                });
                if (response.ok) {
                    const data = await response.json();
                    candleSeries.setData(data);
                }
            } catch (error) {
                console.error("Failed to fetch chart data:", error);
            }
        };

        fetchChartData();

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chartRef.current.remove();
        };
    }, [credentials, symbol, timeframe]);

    return (
        <div ref={chartContainerRef} className="w-full h-full" />
    );
};

export default CandlestickChart;