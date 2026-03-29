'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';
type SignMode = 'draw' | 'type' | 'upload';

const MM = 2.835; // mm to PDF points

export default function PDFSign() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(0);
    const [targetPage, setTargetPage] = useState(1);
    const [pageThumb, setPageThumb] = useState<string | null>(null);   // data URL of current page render
    const [pageThumbW, setPageThumbW] = useState(0);  // rendered canvas width (px)
    const [pageThumbH, setPageThumbH] = useState(0);  // rendered canvas height (px)
    const [pageRealW, setPageRealW] = useState(595);  // PDF page width in points

    // Signature mode
    const [signMode, setSignMode] = useState<SignMode>('draw');
    const [typedText, setTypedText] = useState('');
    const [typedFont, setTypedFont] = useState<'cursive' | 'serif' | 'monospace'>('cursive');
    const [sigColor, setSigColor] = useState('#1a1a2e');
    const [sigThickness, setSigThickness] = useState(3);

    // Canvas drawing
    const sigCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [uploadedSig, setUploadedSig] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const sigImageInputRef = useRef<HTMLInputElement>(null);

    // Placement (mm)
    const [sigX, setSigX] = useState(50);
    const [sigY, setSigY] = useState(20);
    const [sigW, setSigW] = useState(60);
    const [isSelected, setIsSelected] = useState(false);

    const [dragInfo, setDragInfo] = useState<{ startX: number; startY: number; initialX: number; initialY: number; initialScrollY: number } | null>(null);

    const fileRef = useRef<File | null>(null);
    const pdfJsDocRef = useRef<{ getPage: (n: number) => Promise<unknown> } | null>(null);

    // ─── Load PDF & render first page thumbnail ───────────────────────────────
    const renderPageThumb = useCallback(async (pageNum: number) => {
        if (!pdfJsDocRef.current) return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const page: any = await pdfJsDocRef.current.getPage(pageNum);
            const vp = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp } as never).promise;
            setPageThumb(canvas.toDataURL('image/jpeg', 0.85));
            setPageThumbW(vp.width);
            setPageThumbH(vp.height);
            // Get real width at scale=1 for mm→px conversion
            const vp1 = page.getViewport({ scale: 1 });
            setPageRealW(vp1.width);
        } catch (e) { console.error(e); }
    }, []);

    const handleFile = useCallback(async (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file;
        setFileName(file.name);
        setErrorMsg(''); setDownloadUrl(null);
        setStatus('loading');

        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const fileBytes = new Uint8Array(await file.arrayBuffer());
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc = await pdfjs.getDocument({ data: fileBytes }).promise as any;
            pdfJsDocRef.current = doc;
            setPageCount(doc.numPages);
            setTargetPage(1);
            await renderPageThumb(1);
            setStatus('ready');
        } catch (e) {
            console.error(e);
            setErrorMsg('Could not read the PDF.');
            setStatus('error');
        }
    }, [renderPageThumb]);

    // Re-render thumb when target page changes
    useEffect(() => {
        if (status === 'ready' || status === 'processing' || status === 'done') {
            renderPageThumb(targetPage);
        }
    }, [targetPage, renderPageThumb, status]);

    // ─── Canvas drawing helpers ───────────────────────────────────────────────
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
        e.preventDefault(); setIsDrawing(true); setLastPos(getPos(e)); setHasDrawn(true);
    };
    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawing || !sigCanvasRef.current) return;
        const ctx = sigCanvasRef.current.getContext('2d')!;
        const pos = getPos(e);
        ctx.beginPath(); ctx.moveTo(lastPos!.x, lastPos!.y); ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = sigColor; ctx.lineWidth = sigThickness; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke(); setLastPos(pos);
    };
    const endDraw = () => setIsDrawing(false);
    const clearCanvas = () => {
        if (!sigCanvasRef.current) return;
        sigCanvasRef.current.getContext('2d')!.clearRect(0, 0, 500, 300);
        setHasDrawn(false);
    };
    useEffect(() => { clearCanvas(); }, [sigColor]);

    // ─── Get signature as data URL ────────────────────────────────────────────
    const getSignatureDataUrl = useCallback((): string | null => {
        if (signMode === 'upload') {
            return uploadedSig;
        }
        if (signMode === 'draw') {
            if (!hasDrawn || !sigCanvasRef.current) return null;
            return sigCanvasRef.current.toDataURL('image/png');
        }
        if (!typedText.trim()) return null;
        const offscreen = document.createElement('canvas');
        offscreen.width = 400; offscreen.height = 120;
        const ctx = offscreen.getContext('2d')!;
        ctx.font = `60px ${typedFont}`; ctx.fillStyle = sigColor;
        ctx.textBaseline = 'middle'; ctx.fillText(typedText, 10, 60);
        return offscreen.toDataURL('image/png');
    }, [signMode, uploadedSig, hasDrawn, typedText, typedFont, sigColor]);

    const processImageFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        setIsProcessing(true);
        const reader = new FileReader();
        reader.onload = (re) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                setUploadedSig(canvas.toDataURL('image/png'));
                setIsProcessing(false);
            };
            img.onerror = () => setIsProcessing(false);
            img.src = re.target?.result as string;
        };
        reader.onerror = () => setIsProcessing(false);
        reader.readAsDataURL(file);
    }, []);

    // ─── Live preview overlay computation ────────────────────────────────────
    // Convert mm position → preview px position
    // pageRealW/H are in PDF points. pageThumbW/H are the rendered canvas dims.
    const pxPerPoint = pageThumbW / pageRealW;
    const previewSigX = sigX * MM * pxPerPoint;
    const previewSigY = sigY * MM * pxPerPoint; // top-down (Y from top of page)
    const previewSigW = sigW * MM * pxPerPoint;

    // ─── Process PDF ────────────────────────────────────────────────────────
    const handleProcess = async () => {
        if (!fileRef.current) return;
        const sigDataUrl = getSignatureDataUrl();
        if (!sigDataUrl) {
            const msg = signMode === 'upload' ? 'Please upload your signature image.' : 'Please draw or type your signature first.';
            setErrorMsg(msg);
            return;
        }
        setStatus('processing'); setErrorMsg('');

        try {
            const { PDFDocument } = await import('pdf-lib');
            const fileBytes = new Uint8Array(await fileRef.current.arrayBuffer());
            const doc = await PDFDocument.load(fileBytes);
            const page = doc.getPage(targetPage - 1);
            const { height: pageH } = page.getSize();

            const base64 = sigDataUrl.split(',')[1];
            const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const img = await doc.embedPng(imgBytes);

            const drawW = sigW * MM;
            const aspectRatio = img.height / img.width;
            const drawH = drawW * aspectRatio;

            page.drawImage(img, {
                x: sigX * MM,
                y: pageH - sigY * MM - drawH,
                width: drawW,
                height: drawH,
            });

            const outBytes = await doc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Failed to sign the PDF.');
            setStatus('error');
        }
    };

    const isActive = status === 'ready' || status === 'processing' || status === 'done';
    const sigDataUrl = isActive ? getSignatureDataUrl() : null;

    // ─── Drag-to-move handlers ────────────────────────────────────────────────
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragInfo) return;
        
        // Auto-scroll logic if dragging near viewport edges
        const threshold = 80;
        const speed = 10;
        if (e.clientY < threshold) window.scrollBy({ top: -speed, behavior: 'auto' });
        else if (e.clientY > window.innerHeight - threshold) window.scrollBy({ top: speed, behavior: 'auto' });

        const dx = (e.clientX - dragInfo.startX) / (MM * pxPerPoint);
        const dy = (e.clientY - dragInfo.startY + (window.scrollY - dragInfo.initialScrollY)) / (MM * pxPerPoint);
        
        setSigX(Math.max(0, Math.round(dragInfo.initialX + dx)));
        setSigY(Math.max(0, Math.round(dragInfo.initialY + dy)));
    }, [dragInfo, pxPerPoint]);

    const handleMouseUp = () => setDragInfo(null);
    useEffect(() => {
        if (dragInfo) {
            window.addEventListener('mousemove', handleMouseMove as never);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove as never);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove as never);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragInfo, handleMouseMove]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="✍️" title="Sign PDF" />
            <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {isActive && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left: settings */}
                            <div className="flex flex-col gap-4">
                                {/* Mode */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Signature Mode</label>
                                    <div className="flex gap-2">
                                        {(['draw', 'type', 'upload'] as const).map(m => (
                                            <button key={m} onClick={() => setSignMode(m)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${signMode === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                {m === 'draw' ? '✏️ Draw' : m === 'type' ? '⌨️ Type' : '📁 Upload'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Ink color */}
                                <div className="flex items-center gap-3 flex-wrap">
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ink Color</label>
                                    {['#1a1a2e', '#0a3d62', '#000000', '#1a4731', '#4a0000'].map(c => (
                                        <button key={c} onClick={() => setSigColor(c)}
                                            className={`w-7 h-7 rounded-full border-2 transition-all ${sigColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }} />
                                    ))}
                                    <input type="color" value={sigColor} onChange={e => setSigColor(e.target.value)}
                                        className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent" title="Custom" />
                                </div>
                                
                                {/* Signature Thickness */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Pen Thickness: {sigThickness}px</label>
                                    <input type="range" min={1} max={10} step={0.5} value={sigThickness} onChange={e => setSigThickness(+e.target.value)}
                                        className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                </div>

                                {/* Draw / Type panel */}
                                {signMode === 'draw' ? (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Draw Signature</label>
                                            <button onClick={clearCanvas} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕ Clear</button>
                                        </div>
                                        <canvas ref={sigCanvasRef} width={500} height={300}
                                            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                                            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                                            className="w-full rounded-xl border-2 border-dashed border-gray-600 bg-white cursor-crosshair touch-none"
                                            style={{ aspectRatio: '500/300' }} />
                                        {!hasDrawn && <p className="text-xs text-gray-600 text-center mt-1">Draw your signature above</p>}
                                    </div>
                                ) : signMode === 'type' ? (
                                    <div className="flex flex-col gap-3">
                                        <input type="text" value={typedText || ''} onChange={e => setTypedText(e.target.value)}
                                            placeholder="Your name…"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none" />
                                        <div className="flex gap-2">
                                            {(['cursive', 'serif', 'monospace'] as const).map(f => (
                                                <button key={f} onClick={() => setTypedFont(f)}
                                                    className={`flex-1 py-2 rounded-lg text-sm transition-all ${typedFont === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                                    style={{ fontFamily: f }}>
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
                                        <input type="file" ref={sigImageInputRef} className="hidden" accept="image/*"
                                            onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (f) processImageFile(f);
                                            }} />
                                        <button 
                                            onClick={() => sigImageInputRef.current?.click()}
                                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={e => {
                                                e.preventDefault(); e.stopPropagation();
                                                const f = e.dataTransfer.files?.[0];
                                                if (f) processImageFile(f);
                                            }}
                                            className={`w-full py-6 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-3 group relative overflow-hidden ${
                                                uploadedSig ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-indigo-500/50'
                                            }`}>
                                            {isProcessing ? (
                                                <div className="flex flex-col items-center gap-2 py-2">
                                                    <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Processing…</span>
                                                </div>
                                            ) : uploadedSig ? (
                                                <div className="relative w-full px-4 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={uploadedSig} alt="Uploaded" className="max-h-24 object-contain" />
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

                                {/* Placement */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-3">Placement on page</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">X: {sigX}mm</label>
                                            <input type="range" min={0} max={180} value={sigX} onChange={e => setSigX(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Y from top: {sigY}mm</label>
                                            <input type="range" min={0} max={260} value={sigY} onChange={e => setSigY(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Width: {sigW}mm</label>
                                            <input type="range" min={10} max={180} value={sigW} onChange={e => setSigW(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                    </div>
                                </div>

                                {/* Page selector */}
                                {pageCount > 1 && (
                                    <div>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                                            Page: <span className="text-indigo-400">{targetPage}</span> of {pageCount}
                                        </label>
                                        <input type="range" min={1} max={pageCount} value={targetPage}
                                            onChange={e => setTargetPage(+e.target.value)} className="w-full accent-indigo-500" />
                                    </div>
                                )}

                                {/* Actions */}
                                <button onClick={handleProcess} disabled={status === 'processing'}
                                    className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                    {status === 'processing' ? <><span className="animate-spin">⏳</span> Signing…</> : '✍️ Sign & Download'}
                                </button>

                                {status === 'done' && downloadUrl && (
                                    <a href={downloadUrl} download={`signed-${fileName}`}
                                        className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                        ⬇️ Download Signed PDF
                                    </a>
                                )}

                                {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                            </div>

                            {/* Right: live page preview */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Live Preview</label>
                                <div className="relative rounded-xl overflow-hidden border border-gray-700/50 bg-gray-800 flex items-center justify-center cursor-crosshair"
                                    onClick={() => setIsSelected(false)}
                                    style={{ aspectRatio: `${pageThumbW || 210} / ${pageThumbH || 297}` }}>
                                    {pageThumb ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={pageThumb} alt="Page preview" className="w-full h-full object-contain" />

                                            {/* Signature overlay */}
                                            {sigDataUrl && pageThumbW > 0 && (
                                                <div className="absolute inset-0" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={sigDataUrl}
                                                        alt="Signature overlay"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setIsSelected(true);
                                                            setDragInfo({
                                                                startX: e.clientX,
                                                                startY: e.clientY,
                                                                initialX: sigX,
                                                                initialY: sigY,
                                                                initialScrollY: window.scrollY
                                                            });
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsSelected(true);
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${(previewSigX / pageThumbW) * 100}%`,
                                                            top: `${(previewSigY / pageThumbH) * 100}%`,
                                                            width: `${(previewSigW / pageThumbW) * 100}%`,
                                                            objectFit: 'contain',
                                                            pointerEvents: 'auto',
                                                            cursor: 'move',
                                                            userSelect: 'none',
                                                            border: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                                                            boxShadow: isSelected ? '0 0 0 4px rgba(99, 102, 241, 0.2)' : 'none',
                                                            borderRadius: '4px',
                                                            transition: 'border 0.2s, box-shadow 0.2s'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-gray-600 text-sm flex items-center gap-2">
                                            <span className="animate-spin">⏳</span> Loading preview…
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-600 text-center">
                                    Move the X / Y / Width sliders to position your signature
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
