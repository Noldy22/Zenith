
import React from 'react';

interface ChartAnimationProps {
  isAnalyzing: boolean;
}

const ChartAnimation: React.FC<ChartAnimationProps> = ({ isAnalyzing }) => {
  if (!isAnalyzing) {
    return null;
  }

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-10">
      <div className="scanner-glow"></div>
      <style jsx>{`
        .scanner-glow {
          position: absolute;
          top: 0;
          left: -10%; /* Start off-screen */
          width: 10%;
          height: 100%;
          background: linear-gradient(
            90deg,
            rgba(255, 223, 77, 0) 0%,
            rgba(255, 223, 77, 0.3) 50%,
            rgba(255, 223, 77, 0) 100%
          );
          box-shadow: 0 0 15px 5px rgba(255, 223, 77, 0.2);
          animation: scan 3s ease-in-out infinite;
        }

        @keyframes scan {
          0% {
            left: -10%;
          }
          50% {
            left: 100%;
          }
          100% {
            left: -10%;
          }
        }
      `}</style>
    </div>
  );
};

export default ChartAnimation;
