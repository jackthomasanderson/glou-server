'use client';

import React, { useState } from 'react';
import { GardePoint } from '@/lib/analytics/types';

interface GardeHistogramProps {
  data: GardePoint[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

const BAR_WIDTH = 28;
const BAR_GAP = 4;
const CHART_HEIGHT = 120;
const AXIS_HEIGHT = 24;
const AXIS_LABEL_EVERY = 3;

export function GardeHistogram({ data, t }: GardeHistogramProps) {
  // Detect dark mode via CSS media query on the client
  const isDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: CHART_HEIGHT + AXIS_HEIGHT }}
      >
        <span className="text-sm text-default-400">{t('analytics.garde.noData')}</span>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalWidth = data.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  // Colour palette — approximate MUI primary/warning without theme access
  const primaryColor = '#006FEE';
  const pastColor = isDark ? '#374151' : '#d1d5db';
  const todayColor = '#F5A524';

  return (
    <div className="relative overflow-x-auto overflow-y-visible">
      <div className="relative" style={{ minWidth: totalWidth }}>
        {/* Tooltip */}
        {hoveredYear !== null &&
          (() => {
            const pt = data.find((d) => d.year === hoveredYear);
            const idx = data.findIndex((d) => d.year === hoveredYear);
            const x = idx * (BAR_WIDTH + BAR_GAP);
            return pt ? (
              <div
                className="absolute bg-white dark:bg-default-100 border border-default-200 rounded-xl px-2 py-1 z-10 whitespace-nowrap shadow-md pointer-events-none"
                style={{ top: -44, left: Math.min(x, totalWidth - 100) }}
              >
                <span className="text-[11px] font-bold">
                  {pt.year} — {pt.count} {t('analytics.garde.bottles')}
                </span>
              </div>
            ) : null;
          })()}

        <svg
          width={totalWidth}
          height={CHART_HEIGHT + AXIS_HEIGHT}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = CHART_HEIGHT - frac * CHART_HEIGHT;
            return (
              <line
                key={frac}
                x1={0}
                y1={y}
                x2={totalWidth}
                y2={y}
                stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            );
          })}

          {data.map((pt, i) => {
            const x = i * (BAR_WIDTH + BAR_GAP);
            const barH = Math.max(4, (pt.count / maxCount) * CHART_HEIGHT);
            const y = CHART_HEIGHT - barH;
            const isPast = pt.year < currentYear;
            const isNow = pt.year === currentYear;
            const isHovered = pt.year === hoveredYear;

            const fill = isPast
              ? pastColor
              : isNow
              ? todayColor
              : isHovered
              ? `${primaryColor}dd`
              : primaryColor;

            return (
              <g
                key={pt.year}
                onMouseEnter={() => setHoveredYear(pt.year)}
                onMouseLeave={() => setHoveredYear(null)}
                style={{ cursor: 'default' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={barH}
                  rx={4}
                  fill={fill}
                  style={{ transition: 'fill 0.1s ease' }}
                />
                {/* Count label on bar */}
                {isHovered && pt.count > 0 && (
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="currentColor"
                  >
                    {pt.count}
                  </text>
                )}
                {/* Year axis label */}
                {(i % AXIS_LABEL_EVERY === 0 || isNow) && (
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={CHART_HEIGHT + AXIS_HEIGHT - 4}
                    textAnchor="middle"
                    fontSize={isNow ? 10 : 9}
                    fontWeight={isNow ? 700 : 400}
                    fill={
                      isNow
                        ? todayColor
                        : isDark
                        ? 'rgba(255,255,255,0.5)'
                        : 'rgba(0,0,0,0.45)'
                    }
                  >
                    {pt.year}
                  </text>
                )}
                {/* "Maintenant" indicator */}
                {isNow && (
                  <line
                    x1={x + BAR_WIDTH / 2}
                    y1={y - 2}
                    x2={x + BAR_WIDTH / 2}
                    y2={CHART_HEIGHT + 2}
                    stroke={todayColor}
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
