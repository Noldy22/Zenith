"use client";
import React, { useState, useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, LogicalRange, Time } from 'lightweight-charts';

interface ScanningLineAnimationProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  isAnalyzing: boolean;
  candleData: CandlestickData[];
}

const ScanningLineAnimation: React.FC<ScanningLineAnimationProps> = ({ chart, series, isAnalyzing, candleData }) => {
  const [lineStyle, setLineStyle] = useState<React.CSSProperties>({ display: 'none' });
  const [circleStyle, setCircleStyle] = useState<React.CSSProperties>({ display: 'none' });
  const currentIndexRef = useRef(0);
  const directionRef = useRef<'forward' | 'backward'>('forward'); // Track scan direction
  const animationFrameId = useRef<NodeJS.Timeout | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // Get the chart container element once
  useEffect(() => {
    if (chart) {
      chartContainerRef.current = chart.chartElement();
    }
  }, [chart]);

  useEffect(() => {
    if (isAnalyzing && chart && series && candleData.length > 0 && chartContainerRef.current) {
      const containerElement = chartContainerRef.current;
      const chartHeight = containerElement.clientHeight;

      const animate = () => {
        const timeScale = chart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();

        if (visibleRange) {
          const { from, to } = visibleRange;
          // Ensure indices are within bounds and integers
          const startIndex = Math.max(0, Math.floor(from));
          const endIndex = Math.min(candleData.length - 1, Math.floor(to));
          const visibleDataLength = endIndex - startIndex + 1;

          if (visibleDataLength > 0) {
            let currentIndex = currentIndexRef.current;

            // Adjust index based on direction
            if (directionRef.current === 'forward') {
              if (currentIndex >= visibleDataLength) {
                // Reached the end, reverse direction
                directionRef.current = 'backward';
                currentIndex = visibleDataLength - 1; // Start from the last visible candle
              }
            } else { // Backward
              if (currentIndex < 0) {
                // Reached the beginning, reverse direction
                directionRef.current = 'forward';
                currentIndex = 0; // Start from the first visible candle
              }
            }

             // Ensure index is always valid after direction change
            currentIndex = Math.max(0, Math.min(currentIndex, visibleDataLength - 1));

            const actualCandleIndex = startIndex + currentIndex;
            const candle = candleData[actualCandleIndex];

            if (candle) {
              const coordinateX = timeScale.timeToCoordinate(candle.time);
              const midPrice = (candle.high + candle.low) / 2;
              const coordinateY = series.priceToCoordinate(midPrice);

              if (coordinateX !== null && coordinateY !== null) {
                // Vertical Line Style
                setLineStyle({
                  display: 'block',
                  position: 'absolute',
                  left: `${coordinateX - 1}px`, // Center the 2px line
                  top: `0px`,
                  width: `2px`,
                  height: `${chartHeight}px`, // Full height of the chart
                  backgroundColor: 'rgba(212, 175, 55, 0.6)', // Primary color with opacity
                  zIndex: 10,
                  pointerEvents: 'none',
                  transition: 'left 15ms linear', // Faster transition
                });

                // Circle Style (attached to the line)
                const circleSize = 10;
                setCircleStyle({
                  display: 'block',
                  position: 'absolute',
                  left: `${coordinateX - circleSize / 2}px`, // Center the circle on the line
                  top: `${coordinateY - circleSize / 2}px`, // Center the circle vertically on midpoint
                  width: `${circleSize}px`,
                  height: `${circleSize}px`,
                  backgroundColor: 'rgba(212, 175, 55, 0.9)', // Brighter primary color
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  borderRadius: '50%',
                  zIndex: 11, // Above the line
                  pointerEvents: 'none',
                  transition: 'left 15ms linear, top 15ms linear', // Faster transition
                });
              }
            }

            // Move to the next candle based on direction
            currentIndexRef.current = directionRef.current === 'forward' ? currentIndex + 1 : currentIndex - 1;
          }
        }
        animationFrameId.current = setTimeout(animate, 20); // Increased speed (was 37.5ms)
      };

      // Reset index and direction when starting
      currentIndexRef.current = 0;
      directionRef.current = 'forward';
      animate();

    } else {
      // Stop animation and hide elements when not analyzing
      if (animationFrameId.current) {
        clearTimeout(animationFrameId.current);
      }
      setLineStyle({ display: 'none' });
      setCircleStyle({ display: 'none' });
      currentIndexRef.current = 0; // Reset index
      directionRef.current = 'forward'; // Reset direction
    }

    // Cleanup function
    return () => {
      if (animationFrameId.current) {
        clearTimeout(animationFrameId.current);
      }
    };
  }, [isAnalyzing, chart, series, candleData]); // Rerun effect if these change

  // Render the line and circle elements
  return (
    <>
      <div style={lineStyle} />
      <div style={circleStyle} />
    </>
  );
};

export default ScanningLineAnimation;
