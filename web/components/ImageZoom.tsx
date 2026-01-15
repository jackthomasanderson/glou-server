"use client";

import React, { useState, useRef, MouseEvent } from "react";

type ImageZoomProps = {
    src: string;
    alt: string;
};

export function ImageZoom({ src, alt }: ImageZoomProps) {
    const [isZoomed, setIsZoomed] = useState(false);
    const [position, setPosition] = useState({ x: 50, y: 50 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        setPosition({ x, y });
    };

    const handleMouseEnter = () => {
        setIsZoomed(true);
    };

    const handleMouseLeave = () => {
        setIsZoomed(false);
    };

    return (
        <div
            ref={containerRef}
            className="card__image card__image--thumbnail"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <img
                src={src}
                alt={alt}
                style={{
                    transform: isZoomed ? `scale(5)` : 'scale(1)',
                    transformOrigin: `${position.x}% ${position.y}%`,
                }}
            />
        </div>
    );
}
