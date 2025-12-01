import React, { useRef, useState, useEffect, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

interface ChartWrapperProps {
  children: ReactNode;
  className?: string;
  minHeight?: number;
}

/**
 * ChartWrapper - A wrapper component for Recharts that prevents
 * the "width(-1) and height(-1)" warning by ensuring the container
 * has valid dimensions before rendering the chart.
 * 
 * This solves the common issue where ResponsiveContainer renders
 * before the DOM has calculated the parent container's dimensions.
 */
export const ChartWrapper: React.FC<ChartWrapperProps> = ({
  children,
  className = '',
  minHeight = 200
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check if container has valid dimensions
    const checkDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        if (offsetWidth > 0 && offsetHeight > 0) {
          setIsReady(true);
          return true;
        }
      }
      return false;
    };

    // Initial check
    if (checkDimensions()) return;

    // Use ResizeObserver for more reliable detection
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setIsReady(true);
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Fallback: requestAnimationFrame check
    let frameId: number;
    const checkWithRAF = () => {
      if (!checkDimensions()) {
        frameId = requestAnimationFrame(checkWithRAF);
      }
    };
    frameId = requestAnimationFrame(checkWithRAF);

    return () => {
      resizeObserver.disconnect();
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ minHeight: `${minHeight}px` }}
    >
      {isReady ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      ) : (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-slate-50/50"
          style={{ minHeight: `${minHeight}px` }}
        >
          <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
