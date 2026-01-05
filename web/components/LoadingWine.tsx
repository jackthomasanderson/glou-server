import React from 'react';

const LoadingWine = () => {
  return (
    <div className="loading-wine" aria-label="Loading">
      <svg viewBox="0 0 64 64" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Wine Glass */}
        <g className="glass-container">
          <path 
            d="M24 48 H40 M32 48 V36 M22 16 C22 32 42 32 42 16 H22 Z" 
            stroke="var(--accent)" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Wine inside */}
          <path 
            className="wine-liquid"
            d="M24 28 C24 31 40 31 40 28 V18 H24 V28 Z" 
            fill="var(--accent)"
            opacity="0.6"
          />
        </g>

        {/* Bottle */}
        <g className="bottle-container">
          <path 
            d="M48 24 H56 V48 H48 V24 Z M50 24 V18 C50 16 54 16 54 18 V24" 
            stroke="var(--accent)" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Stream */}
        <line 
          className="wine-stream"
          x1="52" y1="14" x2="32" y2="20" 
          stroke="var(--accent)" 
          strokeWidth="1" 
          strokeDasharray="2 4"
        />
      </svg>
    </div>
  );
};

export default LoadingWine;
