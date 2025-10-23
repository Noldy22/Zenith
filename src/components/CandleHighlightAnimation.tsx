"use client";
import { useState, useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, LogicalRange } from 'lightweight-charts';

interface CandleHighlightAnimationProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  isAnalyzing: boolean;
  candleData: CandlestickData[];
}

const CandleHighlightAnimation: React.FC<CandleHighlightAnimationProps> = ({ chart, series, isAnalyzing, candleData }) => {
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({
    display: 'none',
  });
  const currentIndexRef = useRef(0);
  const animationFrameId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAnalyzing && chart && series && candleData.length > 0) {
      const animate = () => {
        const timeScale = chart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();

        if (visibleRange) {
          const { from, to } = visibleRange;
          const visibleData = candleData.slice(Math.floor(from), Math.ceil(to));

          if (visibleData.length > 0) {
            let currentIndex = currentIndexRef.current;
            if (currentIndex >= visibleData.length) {
              currentIndex = 0;
            }

            const candle = visibleData[currentIndex];
            const coordinate = timeScale.timeToCoordinate(candle.time);
            const priceHigh = series.priceToCoordinate(candle.high);
            const priceLow = series.priceToCoordinate(candle.low);

            let width = 10;
            if (currentIndex + 1 < visibleData.length) {
              const nextCandle = visibleData[currentIndex + 1];
              const nextCoordinate = timeScale.timeToCoordinate(nextCandle.time);
              if(nextCoordinate && coordinate) {
                width = nextCoordinate - coordinate;
              }
            } else if (currentIndex > 0) {
                const prevCandle = visibleData[currentIndex - 1];
                const prevCoordinate = timeScale.timeToCoordinate(prevCandle.time);
                if(prevCoordinate && coordinate) {
                    width = coordinate - prevCoordinate;
                }
            }

            if (coordinate !== null && priceHigh !== null && priceLow !== null) {
              const candleHeight = priceLow - priceHigh;
              const highlightHeight = Math.max(20, candleHeight * 0.5); // Make it 50% of the candle height, with a minimum of 20px
              const topPosition = priceHigh + (candleHeight / 2) - (highlightHeight / 2); // Center it vertically

              setHighlightStyle({
                display: 'block',
                position: 'absolute',
                left: `${coordinate - (width + 4) / 2}px`, // Make it slightly wider than the candle
                top: `${topPosition}px`,
                width: `${width + 4}px`,
                height: `${highlightHeight}px`,
                backgroundColor: 'rgba(255, 223, 77, 0.4)',
                border: '1.5px solid rgba(255, 223, 77, 0.8)',
                borderRadius: '8px', // Rounded corners
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'left 37.5ms linear, top 37.5ms linear' // Smooth transition
              });
            }

            currentIndexRef.current = currentIndex + 1;
          }
        }
        animationFrameId.current = setTimeout(animate, 37.5); // Doubled the speed (75ms -> 37.5ms)
      };

      animate();
    } else {
      if (animationFrameId.current) {
        clearTimeout(animationFrameId.current);
      }
      setHighlightStyle({ display: 'none' });
      currentIndexRef.current = 0;
    }

    return () => {
      if (animationFrameId.current) {
        clearTimeout(animationFrameId.current);
      }
    };
  }, [isAnalyzing, chart, series, candleData]);

  return <div style={highlightStyle} />;
};

export default CandleHighlightAnimation;
