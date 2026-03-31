'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { Trash2, UserPlus, Move, Layers, CheckCircle2 } from 'lucide-react';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';
type SignMode = 'draw' | 'type' | 'upload';

type Annotation = {
    id: string;
    type: SignMode;
    data: string; // data URL
    x: number;
    y: number;
    w: number;
    page: number;
};

const MM = 2.835; // mm to PDF points

export default function PDFEdit() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const [pageCount, setPageCount] = useState(0);
    const [targetPage, setTargetPage] = useState(1);
    const [pageThumb, setPageThumb] = useState<string | null>(null);
    const [pageThumbW, setPageThumbW] = useState(0);
    const [pageThumbH, setPageThumbH] = useState(0);
    const [pageRealW, setPageRealW] = useState(595);

    // Annotations State
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    // Signature Creator State (Temporary for adding a new layer)
    const [signMode, setSignMode] = useState<SignMode>('draw');
    const [typedText, setTypedText] = useState('');
    const [typedFont, setTypedFont] = useState<'cursive' | 'serif' | 'monospace'>('cursive');
    const [sigColor, setSigColor] = useState('#1a1a2e');
    const [sigThickness, setSigThickness] = useState(3);
    const sigCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [uploadedSig, setUploadedSig] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const sigImageInputRef = useRef<HTMLInputElement>(null);

    // Drag-to-move state
    const [dragInfo, setDragInfo] = useState<{ id: string, startX: number, startY: number, initialX: number, initialY: number, initialScrollY: number } | null>(null);

    const fileRef = useRef<File | null>(null);
    const pdfJsDocRef = useRef<{ getPage: (n: number) => Promise<unknown> } | null>(null);

    // ─── Load PDF & Render ────────────────────────────────────────────────────
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

    useEffect(() => {
        if (status === 'ready' || status === 'processing' || status === 'done') {
            renderPageThumb(targetPage);
        }
    }, [targetPage, renderPageThumb, status]);

    // ─── Canvas drawing helpers (for adding new layer) ────────────────────────
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

    const getNewLayerDataUrl = useCallback((): string | null => {
        if (signMode === 'upload') return uploadedSig;
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

    const addLayer = () => {
        const data = getNewLayerDataUrl();
        if (!data) { setErrorMsg('Please create content first.'); return; }
        const newAnnotation: Annotation = {
            id: Math.random().toString(36).substr(2, 9),
            type: signMode,
            data,
            x: 50,
            y: 50,
            w: 60,
            page: targetPage,
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
        setIsAdding(false);
        // Reset creator
        setUploadedSig(null);
        setTypedText('');
        clearCanvas();
    };

    const updateSelected = useCallback((patch: Partial<Annotation>) => {
        if (!selectedId) return;
        setAnnotations(prev => prev.map(a => a.id === selectedId ? { ...a, ...patch } : a));
    }, [selectedId]);

    const removeLayer = (id: string) => {
        setAnnotations(prev => prev.filter(a => a.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    // ─── Process ──────────────────────────────────────────────────────────────
    const handleProcess = async () => {
        if (!fileRef.current || annotations.length === 0) return;
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;

        try {
            const { PDFDocument } = await import('pdf-lib');
            const fileBytes = new Uint8Array(await fileRef.current.arrayBuffer());
            const doc = await PDFDocument.load(fileBytes);

            for (const ann of annotations) {
                if (isCancelledRef.current) { setStatus('ready'); return; }
                const page = doc.getPage(ann.page - 1);
                const { height: pageH } = page.getSize();
                const base64 = ann.data.split(',')[1];
                const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                
                // Embed as PNG if it was drawn/typed (transparent), else check header for JPEG
                const isPng = ann.type === 'draw' || ann.type === 'type' || ann.data.startsWith('data:image/png');
                const img = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);

                const drawW = ann.w * MM;
                const aspectRatio = img.height / img.width;
                const drawH = drawW * aspectRatio;

                page.drawImage(img, {
                    x: ann.x * MM,
                    y: pageH - ann.y * MM - drawH,
                    width: drawW,
                    height: drawH,
                });
            }

            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await doc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Failed to process the PDF.');
            setStatus('error');
        }
    };

    const selectedAnn = annotations.find(a => a.id === selectedId);
    const pxPerPoint = pageThumbW / pageRealW;

    const isActive = status === 'ready' || status === 'processing' || status === 'done';

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
        
        updateSelected({
            x: Math.max(0, Math.round(dragInfo.initialX + dx)),
            y: Math.max(0, Math.round(dragInfo.initialY + dy))
        });
    }, [dragInfo, pxPerPoint, updateSelected]);

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
            <ToolHeader icon="🎨" title="Edit PDF (Multi-Layer)" />
            <div className="flex-1 p-6 max-w-6xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="📝" 
                    title="PDF Edit" 
                    description="Edit your PDF by adding text, images, or shapes directly on pages." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {isActive && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Left: Layers & Controls (4 cols) */}
                            <div className="lg:col-span-4 flex flex-col gap-5">
                                {/* Layers List */}
                                <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 overflow-hidden">
                                    <div className="bg-gray-800/80 px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-indigo-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Canvas Layers</span>
                                        </div>
                                        <span className="bg-gray-900 text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400">
                                            {annotations.length}
                                        </span>
                                    </div>
                                    <div className="max-h-[250px] overflow-y-auto p-2 flex flex-col gap-1">
                                        {annotations.length === 0 ? (
                                            <p className="p-4 text-center text-xs text-gray-500 italic">No layers added yet.</p>
                                        ) : (
                                            annotations.map((ann, idx) => (
                                                <div key={ann.id}
                                                    onClick={() => { setSelectedId(ann.id); setTargetPage(ann.page); }}
                                                    className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${selectedId === ann.id ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                                                    <div className="w-10 h-10 bg-white rounded border border-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={ann.data} alt="Layer thumb" className="max-w-full max-h-full object-contain" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-semibold text-gray-200 truncate">Layer {idx + 1} ({ann.type})</p>
                                                        <p className="text-[10px] text-gray-400">Page {ann.page} · {ann.w}mm</p>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); removeLayer(ann.id); }}
                                                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-rose-500/20 hover:text-rose-400 text-gray-500 transition-colors">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <button onClick={() => setIsAdding(true)}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all">
                                        <UserPlus className="h-4 w-4" /> Add New Layer
                                    </button>
                                </div>

                                {/* Selection Controls */}
                                {selectedAnn ? (
                                    <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Move className="h-4 w-4 text-indigo-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Edit Selected Layer</span>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">X Position: {selectedAnn.x}mm</label>
                                            <input type="range" min={0} max={200} value={selectedAnn.x} onChange={e => updateSelected({ x: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Y from top: {selectedAnn.y}mm</label>
                                            <input type="range" min={0} max={280} value={selectedAnn.y} onChange={e => updateSelected({ y: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Width: {selectedAnn.w}mm</label>
                                            <input type="range" min={5} max={180} value={selectedAnn.w} onChange={e => updateSelected({ w: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div className="pt-2 flex gap-2">
                                            <button onClick={() => setSelectedId(null)}
                                                className="flex-1 py-2 rounded-lg bg-gray-700 text-[11px] font-bold hover:bg-gray-600 transition-colors">
                                                Deselect
                                            </button>
                                            <button onClick={() => removeLayer(selectedAnn.id)}
                                                className="flex-1 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold hover:bg-rose-500/20 transition-colors">
                                                Delete Layer
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-32 rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center text-center p-4">
                                        <Move className="h-6 w-6 text-gray-600 mb-2" />
                                        <p className="text-[11px] text-gray-500">Select a layer in the list or click one on the preview to adjust its position.</p>
                                    </div>
                                )}

                                {pageCount > 1 && (
                                    <div>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                                            View Page: <span className="text-indigo-400">{targetPage}</span> of {pageCount}
                                        </label>
                                        <input type="range" min={1} max={pageCount} value={targetPage}
                                            onChange={e => setTargetPage(+e.target.value)} className="w-full accent-indigo-500" />
                                    </div>
                                )}

                                <ProcessingButton
                                    onClick={handleProcess}
                                    onCancel={() => { isCancelledRef.current = true; }}
                                    disabled={annotations.length === 0}
                                    isProcessing={status === 'processing'}
                                    idleLabel={<><CheckCircle2 className="h-4 w-4" /> Save & Download PDF</>}
                                    processingLabel="Processing…"
                                    className="mt-auto font-bold bg-emerald-600 hover:bg-emerald-500 disabled:grayscale shadow-lg shadow-emerald-900/20 border border-emerald-500/50"
                                />

                                {status === 'done' && downloadUrl && (
                                    <a href={downloadUrl} download={`edited-${fileName}`}
                                        className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 border border-indigo-400/50">
                                        ⬇️ Download Edited PDF
                                    </a>
                                )}
                                {errorMsg && <p className="text-rose-400 text-[11px] text-center italic mt-2">⚠️ {errorMsg}</p>}
                            </div>

                            {/* Middle: Live Preview (8 cols) */}
                            <div className="lg:col-span-8 flex flex-col gap-2">
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Document Preview</label>
                                <div className="relative rounded-2xl overflow-hidden border border-gray-700/50 bg-gray-900/50 flex items-center justify-center shadow-2xl shadow-black/50"
                                    onClick={() => setSelectedId(null)}
                                    style={{ aspectRatio: `${pageThumbW || 210} / ${pageThumbH || 297}` }}>
                                    {pageThumb ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={pageThumb} alt="Page preview" className="w-full h-full object-contain" />

                                            {/* Annotations layers */}
                                            <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                                                {annotations.filter(a => a.page === targetPage).map(ann => (
                                                    <div key={ann.id}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedId(ann.id); }}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setSelectedId(ann.id);
                                                            setDragInfo({
                                                                id: ann.id,
                                                                startX: e.clientX,
                                                                startY: e.clientY,
                                                                initialX: ann.x,
                                                                initialY: ann.y,
                                                                initialScrollY: window.scrollY
                                                            });
                                                        }}
                                                        className={`absolute cursor-pointer transition-shadow group ${selectedId === ann.id ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-black z-10' : 'hover:ring-1 hover:ring-indigo-500/50'}`}
                                                        style={{
                                                            pointerEvents: 'auto',
                                                            left: `${(ann.x * MM * pxPerPoint / pageThumbW) * 100}%`,
                                                            top: `${(ann.y * MM * pxPerPoint / pageThumbH) * 100}%`,
                                                            width: `${(ann.w * MM * pxPerPoint / pageThumbW) * 100}%`,
                                                            objectFit: 'contain',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={ann.data} alt="Layer" className="w-full pointer-events-none" />
                                                        {selectedId === ann.id && (
                                                            <div className="absolute -top-2 -right-2 bg-indigo-500 text-white rounded-full p-1 shadow-lg">
                                                                <Move className="h-3 w-3" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-gray-600 text-sm flex items-center gap-2">
                                            <span className="animate-spin text-indigo-500">⏳</span> Loading PDF preview…
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for adding a new layer */}
            {isAdding && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-indigo-900/10">
                            <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-indigo-400" /> Create New Layer
                            </h3>
                            <button onClick={() => setIsAdding(false)} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
                        </div>
                        <div className="p-6 flex flex-col gap-5">
                            <div className="flex gap-2 p-1 bg-gray-800 rounded-xl">
                                {(['draw', 'type', 'upload'] as const).map(m => (
                                    <button key={m} onClick={() => setSignMode(m)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${signMode === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}>
                                        {m === 'draw' ? '✏️ Draw' : m === 'type' ? '⌨️ Type' : '📁 Upload'}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[180px] flex flex-col justify-center">
                                {signMode === 'draw' ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Ink: {sigColor}</label>
                                            <button onClick={clearCanvas} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest">Clear Canvas</button>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-3">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Thickness: {sigThickness}px</label>
                                                <input type="range" min={1} max={10} step={0.5} value={sigThickness} onChange={e => setSigThickness(+e.target.value)}
                                                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                            </div>
                                            <canvas ref={sigCanvasRef} width={500} height={300}
                                                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                                                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                                                className="w-full rounded-xl border-2 border-dashed border-gray-700 bg-white cursor-crosshair touch-none"
                                                style={{ aspectRatio: '500/300' }} />
                                        </div>
                                    </div>
                                ) : signMode === 'type' ? (
                                    <div className="flex flex-col gap-4">
                                        <input type="text" value={typedText || ''} onChange={e => setTypedText(e.target.value)}
                                            placeholder="Enter text here…"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 text-lg text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition-all" />
                                        <div className="flex gap-2">
                                            {(['cursive', 'serif', 'monospace'] as const).map(f => (
                                                <button key={f} onClick={() => setTypedFont(f)}
                                                    className={`flex-1 py-2 rounded-lg text-sm transition-all border ${typedFont === f ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-600'}`}
                                                    style={{ fontFamily: f }}>
                                                    {f === 'cursive' ? 'Script' : f === 'monospace' ? 'Mono' : 'Serif'}
                                                </button>
                                            ))}
                                        </div>
                                        {typedText && (
                                            <div className="bg-white rounded-xl py-6 flex items-center justify-center">
                                                <span style={{ fontFamily: typedFont, color: sigColor, fontSize: 40 }}>{typedText}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
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
                                            className={`w-full py-10 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center gap-4 group relative overflow-hidden ${
                                                uploadedSig ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-gray-700 bg-gray-800/30 hover:bg-gray-800/50 hover:border-indigo-500/50'
                                            }`}>
                                            {isProcessing ? (
                                                <div className="flex flex-col items-center gap-3 py-4">
                                                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Processing Image…</span>
                                                </div>
                                            ) : uploadedSig ? (
                                                <div className="relative px-6 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={uploadedSig} alt="Uploaded" className="max-h-36 object-contain drop-shadow-2xl" />
                                                    <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl backdrop-blur-[2px]">
                                                        <div className="bg-white/10 px-4 py-2 rounded-full border border-white/20 text-xs font-bold text-white shadow-xl">
                                                            Click to Change
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="w-16 h-16 rounded-3xl bg-gray-800 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:rotate-3 transition-all duration-300 shadow-lg">🖼️</div>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-sm font-bold text-gray-300 tracking-tight">Choose or Drag Image</span>
                                                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-[0.2em]">PNG, JPG, WebP supported</span>
                                                    </div>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4 py-2">
                                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Color:</label>
                                {['#1a1a2e', '#000000', '#0a3d62', '#1a4731', '#4a0000'].map(c => (
                                    <button key={c} onClick={() => setSigColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 transition-all ${sigColor === c ? 'border-indigo-500 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} />
                                ))}
                                <input type="color" value={sigColor} onChange={e => setSigColor(e.target.value)}
                                    className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent" title="Custom" />
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-800">
                                <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-all">Cancel</button>
                                <button onClick={addLayer} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/30">Add Layer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <p className="py-6 text-center text-gray-600 text-xs">🔒 Privacy First: All processing happens in your browser. Nothing is uploaded to any server.</p>
        </div>
    );
}
