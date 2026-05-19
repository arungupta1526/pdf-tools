'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import SignaturePad from '@/components/SignaturePad';
import { Trash2, UserPlus, Move, Layers, CheckCircle2 } from 'lucide-react';
import { canvasToObjectUrl, loadPdfDocument, renderPdfPageToCanvas, revokeObjectUrl, type PdfJsDocument } from '@/lib/pdf-browser';
import { usePdfTool } from '@/hooks/usePdfTool';

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
    const {
        status, setStatus,
        fileName,
        errorMsg, setErrorMsg,
        downloadUrl, setDownloadUrl,
        fileRef,
        isCancelledRef,
        handleFile: hookHandleFile,
    } = usePdfTool();

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

    // Signature creator state (temporary, for adding a new layer via the modal)
    const [newLayerDataUrl, setNewLayerDataUrl] = useState<string | null>(null);
    const [newLayerMode, setNewLayerMode] = useState<SignMode>('draw');

    // Drag-to-move state
    const [dragInfo, setDragInfo] = useState<{ id: string; startX: number; startY: number; initialX: number; initialY: number; initialScrollY: number } | null>(null);

    const pdfJsDocRef = useRef<PdfJsDocument | null>(null);

    // ─── Load PDF & Render ────────────────────────────────────────────────────
    const renderPageThumb = useCallback(async (pageNum: number) => {
        if (!pdfJsDocRef.current) return;
        try {
            const page = await pdfJsDocRef.current.getPage(pageNum);
            const vp = page.getViewport({ scale: 1.35 });
            const canvas = await renderPdfPageToCanvas(pdfJsDocRef.current, pageNum, { scale: 1.35 });
            const url = await canvasToObjectUrl(canvas, 'image/jpeg', 0.85);
            setPageThumb((prev) => {
                revokeObjectUrl(prev);
                return url;
            });
            setPageThumbW(vp.width);
            setPageThumbH(vp.height);
            const vp1 = page.getViewport({ scale: 1 });
            setPageRealW(vp1.width);
        } catch (e) { console.error(e); }
    }, []);

    const loadPdf = useCallback(async (file: File) => {
        setStatus('loading');
        setAnnotations([]);
        setSelectedId(null);
        setIsAdding(false);
        setNewLayerDataUrl(null);
        try {
            const doc = await loadPdfDocument(await file.arrayBuffer());
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
    }, [setStatus, setErrorMsg, renderPageThumb]);

    const handleFile = useCallback((file: File) => {
        hookHandleFile(file, (f) => loadPdf(f));
    }, [hookHandleFile, loadPdf]);

    useEffect(() => {
        if (status === 'ready' || status === 'processing' || status === 'done') {
            renderPageThumb(targetPage);
        }
    }, [targetPage, renderPageThumb, status]);
    useEffect(() => () => revokeObjectUrl(pageThumb), [pageThumb]);

    // ─── Layer management ─────────────────────────────────────────────────────
    const addLayer = () => {
        if (!newLayerDataUrl) { setErrorMsg('Please create content first.'); return; }
        const newAnnotation: Annotation = {
            id: crypto.randomUUID(),
            type: newLayerMode,
            data: newLayerDataUrl,
            x: 50,
            y: 50,
            w: 60,
            page: targetPage,
        };
        setAnnotations((prev) => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
        setIsAdding(false);
        setNewLayerDataUrl(null);
    };

    const updateSelected = useCallback((patch: Partial<Annotation>) => {
        if (!selectedId) return;
        setAnnotations((prev) => prev.map((a) => a.id === selectedId ? { ...a, ...patch } : a));
    }, [selectedId]);

    const removeLayer = (id: string) => {
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    // ─── Process ──────────────────────────────────────────────────────────────
    const handleProcess = async () => {
        if (!fileRef.current || annotations.length === 0) return;
        setStatus('processing');
        setErrorMsg('');
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
                const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

                // Draw/type modes produce transparent PNGs; uploads may be JPEG
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
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(blob);
            });
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Failed to process the PDF.');
            setStatus('error');
        }
    };

    const selectedAnn = annotations.find((a) => a.id === selectedId);
    const pxPerPoint = pageThumbW / pageRealW;
    const isActive = status === 'ready' || status === 'processing' || status === 'done';

    // ─── Drag-to-move handlers ────────────────────────────────────────────────
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragInfo) return;
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
                                                <div
                                                    key={ann.id}
                                                    onClick={() => { setSelectedId(ann.id); setTargetPage(ann.page); }}
                                                    className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${selectedId === ann.id ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                                                >
                                                    <div className="w-10 h-10 bg-white rounded border border-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={ann.data} alt="Layer thumb" className="max-w-full max-h-full object-contain" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-semibold text-gray-200 truncate">Layer {idx + 1} ({ann.type})</p>
                                                        <p className="text-[10px] text-gray-400">Page {ann.page} · {ann.w}mm</p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeLayer(ann.id); }}
                                                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-rose-500/20 hover:text-rose-400 text-gray-500 transition-colors"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsAdding(true)}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
                                    >
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
                                            <input type="range" min={0} max={200} value={selectedAnn.x} onChange={(e) => updateSelected({ x: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Y from top: {selectedAnn.y}mm</label>
                                            <input type="range" min={0} max={280} value={selectedAnn.y} onChange={(e) => updateSelected({ y: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Width: {selectedAnn.w}mm</label>
                                            <input type="range" min={5} max={180} value={selectedAnn.w} onChange={(e) => updateSelected({ w: +e.target.value })} className="w-full accent-indigo-500" />
                                        </div>
                                        <div className="pt-2 flex gap-2">
                                            <button onClick={() => setSelectedId(null)} className="flex-1 py-2 rounded-lg bg-gray-700 text-[11px] font-bold hover:bg-gray-600 transition-colors">
                                                Deselect
                                            </button>
                                            <button onClick={() => removeLayer(selectedAnn.id)} className="flex-1 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold hover:bg-rose-500/20 transition-colors">
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
                                            onChange={(e) => setTargetPage(+e.target.value)} className="w-full accent-indigo-500" />
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
                                <div
                                    className="relative rounded-2xl overflow-hidden border border-gray-700/50 bg-gray-900/50 flex items-center justify-center shadow-2xl shadow-black/50"
                                    onClick={() => setSelectedId(null)}
                                    style={{ aspectRatio: `${pageThumbW || 210} / ${pageThumbH || 297}` }}
                                >
                                    {pageThumb ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={pageThumb} alt="Page preview" className="w-full h-full object-contain" />

                                            {/* Annotations layers */}
                                            <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                                                {annotations.filter((a) => a.page === targetPage).map((ann) => (
                                                    <div
                                                        key={ann.id}
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
                            {/* Shared SignaturePad component for layer creation */}
                            <SignaturePad
                                onChange={(dataUrl) => {
                                    setNewLayerDataUrl(dataUrl);
                                    // Infer mode from current SignaturePad state via the data URL prefix
                                    if (dataUrl?.startsWith('data:image/png')) {
                                        setNewLayerMode('draw');
                                    }
                                }}
                            />

                            <div className="flex gap-3 pt-4 border-t border-gray-800">
                                <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-all">Cancel</button>
                                <button
                                    onClick={addLayer}
                                    disabled={!newLayerDataUrl}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/30"
                                >
                                    Add Layer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <p className="py-6 text-center text-gray-600 text-xs">🔒 Privacy First: All processing happens in your browser. Nothing is uploaded to any server.</p>
        </div>
    );
}
