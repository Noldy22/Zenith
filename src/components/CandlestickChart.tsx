"use client";

import {
  createChart,
  ColorType,
  ISeriesApi,
  IChartApi,
  CandlestickData,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { formatMarkers, formatZones, formatLines } from "@/lib/chartUtils";
import { Zone, Line, Pattern, Suggestion } from "@/lib/types";

interface TradingChartProps {
  data: CandlestickData[];
  onChartReady?: (chart: IChartApi) => void;
  onSeriesReady?: (series: ISeriesApi<"Candlestick">) => void;
  supportLevels?: Line[];
  resistanceLevels?: Line[];
  demandZones?: Zone[];
  supplyZones?: Zone[];
  bullishOBs?: Zone[];
  bearishOBs?: Zone[];
  bullishFVGs?: Zone[];
  bearishFVGs?: Zone[];
  buySideLiquidity?: Line[];
  sellSideLiquidity?: Line[];
  candlestickPatterns?: Pattern[];
  suggestion?: Suggestion;
}

export function TradingChart({
  data,
  onChartReady,
  onSeriesReady,
  supportLevels = [],
  resistanceLevels = [],
  demandZones = [],
  supplyZones = [],
  bullishOBs = [],
  bearishOBs = [],
  bullishFVGs = [],
  bearishFVGs = [],
  buySideLiquidity = [],
  sellSideLiquidity = [],
  candlestickPatterns = [],
  suggestion,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "rgba(255, 255, 255, 0.9)",
      },
      grid: {
        vertLines: { color: "#334158" },
        horzLines: { color: "#334158" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });
    chartRef.current = chart;
    if (onChartReady) {
      onChartReady(chart);
    }

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      borderUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      wickUpColor: "#26a69a",
    });
    seriesRef.current = candleSeries;
    if (onSeriesReady) {
      onSeriesReady(candleSeries);
    }

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current!.clientWidth,
        height: chartContainerRef.current!.clientHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [onChartReady, onSeriesReady]);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();

      // Combine all markers
      const allMarkers = [
        ...(candlestickPatterns || []),
      ];
      const formattedMarkers = formatMarkers(allMarkers, data);
      seriesRef.current.setMarkers(formattedMarkers);
    }
  }, [data, candlestickPatterns]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}