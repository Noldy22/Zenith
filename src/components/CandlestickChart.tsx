"use client";

import { createChart, ColorType } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

interface Props {
    credentials?: { login?: string } | null;
    symbol: string;
    timeframe: string;
}

const CandlestickChart = ({ credentials, symbol, timeframe }: Props) => {
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!credentials || !credentials.login) return;

        const handleResize = () => {
            const container = chartContainerRef.current;
            const chart = chartRef.current;
            if (!container || !chart) return;
            chart.applyOptions({ width: container.clientWidth });
        };

        // create chart once
        const container = chartContainerRef.current;
        if (!container) return;

        chartRef.current = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: '#1f2937' },
                textColor: '#d1d5db',
            },
            grid: {
                vertLines: { color: '#374151' },
                horzLines: { color: '#374151' },
            },
            width: container.clientWidth,
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
                const response = await fetch(`http://${window.location.hostname}:5000/api/get_chart_data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
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
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [credentials, symbol, timeframe]);

    return (
        <div ref={chartContainerRef} className="w-full h-full" />
    );
};

export default CandlestickChart;