import React from 'react';

interface ChartAnimationProps {
  isAnalyzing: boolean;
}

const ChartAnimation: React.FC<ChartAnimationProps> = ({ isAnalyzing }) => {
  if (!isAnalyzing) {
    return null;
  }

  return (
    // This div will cover the chart and hold the animations
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg z-10">
      
      {/* 1. Pulsing Border Effect */}
      <div className="pulse-border absolute inset-0 rounded-lg"></div>
      
      {/* 2. Sonar Pulse Effect */}
      <div className="sonar-pulse absolute"></div>
      
      {/* We use <style jsx> for the keyframe animations */}
      <style jsx>{`
        .pulse-border {
          /* Use your primary color #D4AF37 -> rgb(212, 175, 55) */
          animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          /* Ensure it matches the Card's border radius */
          border-radius: 0.5rem; 
        }
        
        .sonar-pulse {
          /* Center the pulse */
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          background-color: rgba(212, 175, 55, 0.5); /* Primary color */
          border-radius: 50%;
          transform: translate(-50%, -50%);
          /* Animation */
          animation: sonar 2s ease-out infinite;
          opacity: 0;
        }

        @keyframes pulse-border {
          0%, 100% {
            /* Start and end with a visible, tight glow */
            box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7);
          }
          50% {
            /* Pulse outwards and fade */
            box-shadow: 0 0 0 14px rgba(212, 175, 55, 0);
          }
        }
        
        @keyframes sonar {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.6;
          }
          100% {
            /* Scale up to be larger than the chart */
            transform: translate(-50%, -50%) scale(40); 
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default ChartAnimation;
