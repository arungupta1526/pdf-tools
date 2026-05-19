'use client';

import React from 'react';

interface LayoutPreviewProps {
    cols: number;
    rows: number;
    orientation: 'portrait' | 'landscape' | 'auto';
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    innerMargin: number;
    showBorder: boolean;
    direction: 'ltr' | 'rtl';
}

/**
 * Interactive miniature paper layout preview for the N-up / Pages Per Sheet tool.
 * Extracted from the inline IIFE in PDFNup.tsx into a named component.
 */
export default function LayoutPreview({
    cols,
    rows,
    orientation,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    innerMargin,
    showBorder,
    direction,
}: LayoutPreviewProps) {
    // Compute effective orientation
    let isLandscape = orientation === 'landscape';
    if (orientation === 'auto') isLandscape = cols > rows;

    // Preview container dimensions (px) — aspect ratio matches real paper
    const previewW = isLandscape ? 280 : 200;
    const previewH = isLandscape ? 200 : 280;

    // Scale margins for preview (map mm → preview px, proportionally)
    const maxDim = Math.max(previewW, previewH);
    const mtPx = (marginTop / 30) * (maxDim * 0.12);
    const mbPx = (marginBottom / 30) * (maxDim * 0.12);
    const mlPx = (marginLeft / 30) * (maxDim * 0.12);
    const mrPx = (marginRight / 30) * (maxDim * 0.12);
    const imPx = (innerMargin / 20) * (maxDim * 0.04);

    // Usable area
    const usableW = previewW - mlPx - mrPx;
    const usableH = previewH - mtPx - mbPx;
    const cellW = Math.max((usableW - (cols - 1) * imPx) / cols, 4);
    const cellH = Math.max((usableH - (rows - 1) * imPx) / rows, 4);
    const totalCells = cols * rows;

    const hasMargin = marginTop > 0 || marginBottom > 0 || marginLeft > 0 || marginRight > 0;

    return (
        <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Layout Preview</p>
            <div
                className="bg-white rounded-lg shadow-lg shadow-black/30 relative transition-all duration-300"
                style={{ width: previewW, height: previewH }}
            >
                {/* Outer margin indicator */}
                {hasMargin && (
                    <div
                        className="absolute border border-dashed border-blue-400/30 rounded pointer-events-none transition-all duration-300"
                        style={{ top: mtPx, left: mlPx, right: mrPx, bottom: mbPx }}
                    />
                )}

                {/* Grid cells */}
                {Array.from({ length: totalCells }, (_, i) => {
                    const gridRow = Math.floor(i / cols);
                    let gridCol = i % cols;
                    if (direction === 'rtl') gridCol = cols - 1 - gridCol;

                    const x = mlPx + gridCol * (cellW + imPx);
                    const y = mtPx + gridRow * (cellH + imPx);

                    return (
                        <div
                            key={i}
                            className="absolute flex items-center justify-center transition-all duration-300"
                            style={{
                                left: x,
                                top: y,
                                width: cellW,
                                height: cellH,
                                backgroundColor: 'rgba(79, 70, 229, 0.12)',
                                border: showBorder
                                    ? '1px solid rgba(79, 70, 229, 0.5)'
                                    : '1px solid transparent',
                                borderRadius: 2,
                            }}
                        >
                            <span className="text-[10px] font-bold" style={{ color: 'rgba(79, 70, 229, 0.7)' }}>
                                {i + 1}
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-3 text-[9px] text-gray-500">
                <span>📏 Outer: {marginTop}/{marginBottom}/{marginLeft}/{marginRight}mm</span>
                <span>↔ Inner: {innerMargin}mm</span>
                <span>{showBorder ? '☑ Border' : '☐ No border'}</span>
            </div>
        </div>
    );
}
