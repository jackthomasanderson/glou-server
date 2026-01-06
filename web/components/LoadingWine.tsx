import React from 'react';

const LoadingWine = () => {
  return (
    <div className="loading-wine" aria-label="Loading">
      <svg viewBox="0 0 120 80" width="120" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bouteille */}
        <g className="bottle-container">
          {/* Corps de la bouteille */}
          <path 
            d="M20 20 H28 V50 H20 V20 Z M22 20 V14 C22 12 26 12 26 14 V20" 
            stroke="var(--accent)" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Liquide dans la bouteille avec animation de baisse */}
          <rect
            className="bottle-liquid"
            x="21"
            y="24"
            width="6"
            height="24"
            fill="var(--accent)"
            opacity="0.4"
          />
        </g>

        {/* Filet de liquide versé (animation) */}
        <path 
          className="wine-stream"
          d="M 26 14 Q 45 28, 64 42"
          stroke="var(--accent)" 
          strokeWidth="2" 
          strokeLinecap="round"
          fill="none"
          opacity="0"
        />

        {/* Verre à pied */}
        <g className="glass-container">
          {/* Pied du verre */}
          <line x1="64" y1="70" x2="64" y2="50" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="58" y1="70" x2="70" y2="70" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          
          {/* Coupe du verre */}
          <path 
            d="M 54 50 L 50 30 H 78 L 74 50 Z" 
            stroke="var(--accent)" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          
          {/* Liquide dans le verre (se remplit progressivement) */}
          <clipPath id="glassClip">
            <path d="M 54 50 L 50 30 H 78 L 74 50 Z" />
          </clipPath>
          <rect 
            className="wine-liquid"
            x="50" 
            y="30" 
            width="28" 
            height="20" 
            fill="var(--accent)"
            opacity="0.6"
            clipPath="url(#glassClip)"
          />
        </g>
      </svg>
    </div>
  );
};

export default LoadingWine;
