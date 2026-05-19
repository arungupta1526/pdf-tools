'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { isImageFile } from '@/lib/pdf-browser';

export type SignMode = 'draw' | 'type' | 'upload';

export interface SignaturePadProps {
    /** Called whenever the current signature data URL changes (null = no signature yet) */
    onChange?: (dataUrl: string | null) => void;
    /** Initial drawing color */
    initialColor?: string;
    /** Initial pen thickness */
    initialThickness?: number;
}

/**
 * Reusable signature creator with three modes: draw, type, upload.
 * Shared between PDFSign and PDFEdit to eliminate ~200 lines of duplication.
 */
export default function SignaturePad({
    onChange,
    initialColor = '#1a1a2e',
    initialThickness = 3,
}: SignaturePadProps) {
    const [signMode, setSignMode] = useState<SignMode>('draw');
    const [typedText, setTypedText] = useState('');
    const [typedFont, setTypedFont] = useState<'cursive' | 'serif' | 'monospace'>('cursive');
    const [sigColor, setSigColor] = useState(initialColor);
    const [sigThickness, setSigThickness] = useState(initialThickness);

    // Draw canvas state
    const sigCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);

    // Upload state
    const [uploadedSig, setUploadedSig] = useState<string | null>(null);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const sigImageInputRef = useRef<HTMLInputElement>(null);

    // ── Notify parent whenever signature changes ──────────────────────────────
    const getDataUrl = useCallback((): string | null => {
        if (signMode === 'upload') return uploadedSig;
        if (signMode === 'draw') {
            if (!hasDrawn || !sigCanvasRef.current) return null;
            return sigCanvasRef.current.toDataURL('image/png');
        }
        // type mode
        if (!typedText.trim()) return null;
        const offscreen = document.createElement('canvas');
        offscreen.width = 400;
        offscreen.height = 120;
        const ctx = offscreen.getContext('2d')!;
        ctx.font = `60px ${typedFont}`;
        ctx.fillStyle = sigColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(typedText, 10, 60);
        return offscreen.toDataURL('image/png');
    }, [signMode, uploadedSig, hasDrawn, typedText, typedFont, sigColor]);

    useEffect(() => {
        if (signMode !== 'draw') {
            onChange?.(getDataUrl());
        }
    }, [getDataUrl, onChange, signMode]);

    // ── Canvas helpers ────────────────────────────────────────────────────────
    const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = sigCanvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if ('touches' in e) {
            return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
        }
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        isDrawingRef.current = true;
        lastPosRef.current = getPos(e);
        setHasDrawn(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawingRef.current || !sigCanvasRef.current || !lastPosRef.current) return;
        const ctx = sigCanvasRef.current.getContext('2d')!;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = sigColor;
        ctx.lineWidth = sigThickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastPosRef.current = pos;
        
        // Only trigger onChange on mouse up/leave to prevent excessive re-renders
    };

    const endDraw = () => {
        isDrawingRef.current = false;
        onChange?.(getDataUrl());
    };

    const clearCanvas = () => {
        if (!sigCanvasRef.current) return;
        sigCanvasRef.current.getContext('2d')!.clearRect(0, 0, 500, 300);
        setHasDrawn(false);
    };

    // ── Image upload handler ─────────────────────────────────────────────────
    const processImageFile = useCallback((file: File) => {
        if (!isImageFile(file)) return;
        setIsProcessingImage(true);
        const reader = new FileReader();
        reader.onload = (re) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                setUploadedSig(canvas.toDataURL('image/png'));
                setIsProcessingImage(false);
            };
            img.onerror = () => setIsProcessingImage(false);
            img.src = re.target?.result as string;
        };
        reader.onerror = () => setIsProcessingImage(false);
        reader.readAsDataURL(file);
    }, []);

    return (
        <div className="flex flex-col gap-4">
            {/* Mode tabs */}
            <div className="flex gap-2">
                {(['draw', 'type', 'upload'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => setSignMode(m)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${signMode === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                        {m === 'draw' ? '✏️ Draw' : m === 'type' ? '⌨️ Type' : '📁 Upload'}
                    </button>
                ))}
            </div>

            {/* Ink color + thickness (only relevant for draw/type) */}
            {signMode !== 'upload' && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ink Color</label>
                        {['#1a1a2e', '#0a3d62', '#000000', '#1a4731', '#4a0000'].map((c) => (
                            <button
                                key={c}
                                onClick={() => { setSigColor(c); clearCanvas(); }}
                                className={`w-7 h-7 rounded-full border-2 transition-all ${sigColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                        <input
                            type="color"
                            value={sigColor}
                            onChange={(e) => { setSigColor(e.target.value); clearCanvas(); }}
                            className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent"
                            title="Custom color"
                        />
                    </div>
                    {signMode === 'draw' && (
                        <div>
                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                                Pen Thickness: {sigThickness}px
                            </label>
                            <input
                                type="range"
                                min={1}
                                max={10}
                                step={0.5}
                                value={sigThickness}
                                onChange={(e) => setSigThickness(+e.target.value)}
                                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Mode panels */}
            {signMode === 'draw' ? (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Draw Signature</label>
                        <button onClick={clearCanvas} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕ Clear</button>
                    </div>
                    <canvas
                        ref={sigCanvasRef}
                        width={500}
                        height={300}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={endDraw}
                        onMouseLeave={endDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={endDraw}
                        className="w-full rounded-xl border-2 border-dashed border-gray-600 bg-white cursor-crosshair touch-none"
                        style={{ aspectRatio: '500/300' }}
                    />
                    {!hasDrawn && (
                        <p className="text-xs text-gray-600 text-center mt-1">Draw your signature above</p>
                    )}
                </div>
            ) : signMode === 'type' ? (
                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        value={typedText}
                        onChange={(e) => setTypedText(e.target.value)}
                        placeholder="Your name…"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                        {(['cursive', 'serif', 'monospace'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setTypedFont(f)}
                                className={`flex-1 py-2 rounded-lg text-sm transition-all ${typedFont === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                style={{ fontFamily: f }}
                            >
                                {f === 'cursive' ? 'Script' : f === 'monospace' ? 'Mono' : 'Serif'}
                            </button>
                        ))}
                    </div>
                    {typedText && (
                        <div className="bg-white rounded-xl p-3 flex items-center justify-center min-h-[60px]">
                            <span style={{ fontFamily: typedFont, color: sigColor, fontSize: 32 }}>{typedText}</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Upload Signature Image</label>
                    <input
                        type="file"
                        ref={sigImageInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) processImageFile(f);
                        }}
                    />
                    <button
                        onClick={() => sigImageInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const f = e.dataTransfer.files?.[0];
                            if (f) processImageFile(f);
                        }}
                        className={`w-full py-6 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-3 group relative overflow-hidden ${uploadedSig ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-indigo-500/50'}`}
                    >
                        {isProcessingImage ? (
                            <div className="flex flex-col items-center gap-2 py-2">
                                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Processing…</span>
                            </div>
                        ) : uploadedSig ? (
                            <div className="relative w-full px-4 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={uploadedSig} alt="Uploaded signature" className="max-h-24 object-contain" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                                    <span className="text-xs font-bold text-white">Click to Change</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="text-3xl opacity-50 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">🖼️</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-sm text-gray-400 font-medium tracking-tight">Click or Drag Image</span>
                                    <span className="text-[10px] text-gray-600 uppercase tracking-widest mt-0.5">PNG, JPG, WebP</span>
                                </div>
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
