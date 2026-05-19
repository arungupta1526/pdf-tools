'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import DropZone from '@/components/DropZone';
import { loadPdfDocument, mapConcurrent, renderPdfPageImage, revokeObjectUrl } from '@/lib/pdf-browser';
import { usePdfTool } from '@/hooks/usePdfTool';

interface PageThumb { pageNum: number; url: string; remove: boolean; }

export default function PDFRemovePages() {
    const {
        status, setStatus,
        fileName,
        errorMsg, setErrorMsg,
        downloadUrl, setDownloadUrl,
        fileRef,
        isCancelledRef,
        handleFile: baseHandleFile
    } = usePdfTool();
    const [showPreviews, setShowPreviews] = useState(false);
    const [thumbs, setThumbs] = useState<PageThumb[]>([]);
    const thumbUrlsRef = useRef<string[]>([]);
    const generationIdRef = useRef(0);

    useEffect(() => {
        thumbUrlsRef.current = thumbs.map((thumb) => thumb.url);
    }, [thumbs]);
    useEffect(() => () => thumbUrlsRef.current.forEach(revokeObjectUrl), []);

    const loadThumbs = useCallback(async (file: File, previews: boolean, currentThumbs: PageThumb[] = []) => {
        setStatus('loading');
        const genId = ++generationIdRef.current;
        setThumbs((prev) => {
            prev.forEach((thumb) => revokeObjectUrl(thumb.url));
            return [];
        });
        try {
            const doc = await loadPdfDocument(await file.arrayBuffer());
            if (genId !== generationIdRef.current) return;
            const pageNumbers = Array.from({ length: doc.numPages }, (_, index) => index + 1);
            const results = await mapConcurrent(pageNumbers, 3, async (pageNum) => {
                if (genId !== generationIdRef.current) throw new Error('CANCELLED_THUMB_GEN');
                return {
                    pageNum,
                    url: (previews || pageNum === 1) ? await renderPdfPageImage(doc, pageNum, { scale: 0.4, quality: 0.7 }) : '',
                    remove: currentThumbs.length > 0 ? currentThumbs[pageNum - 1]?.remove ?? false : false,
                };
            });
            if (genId === generationIdRef.current) {
                setThumbs(results); 
                setStatus('ready');
            }
        } catch (e) { 
            if (e instanceof Error && e.message === 'CANCELLED_THUMB_GEN') return;
            console.error(e); 
            setErrorMsg('Failed to load PDF.'); 
            setStatus('error'); 
        }
    }, [setStatus, setErrorMsg]);

    useEffect(() => {
        if (fileRef.current && status !== 'idle' && status !== 'loading') {
            loadThumbs(fileRef.current, showPreviews, thumbs);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPreviews]);

    const handleFile = (file: File) => {
        baseHandleFile(file, (f) => {
            loadThumbs(f, showPreviews);
        });
    };

    const toggleRemove = (n: number) => setThumbs((prev) => prev.map((t) => t.pageNum === n ? { ...t, remove: !t.remove } : t));
    const selectAll = () => setThumbs((prev) => prev.map((t) => ({ ...t, remove: true })));
    const deselectAll = () => setThumbs((prev) => prev.map((t) => ({ ...t, remove: false })));

    const handleRemove = async () => {
        if (!fileRef.current) return;
        const toKeep = thumbs.filter(t => !t.remove).map(t => t.pageNum - 1);
        if (toKeep.length === 0) { setErrorMsg('Cannot remove all pages.'); return; }
        if (toKeep.length === thumbs.length) { setErrorMsg('No pages marked for removal.'); return; }
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;
        try {
            const { PDFDocument } = await import('pdf-lib');
            const srcBytes = await fileRef.current.arrayBuffer();
            const srcDoc = await PDFDocument.load(srcBytes);
            const newDoc = await PDFDocument.create();
            const pages = await newDoc.copyPages(srcDoc, toKeep);
            if (isCancelledRef.current) { setStatus('ready'); return; }
            pages.forEach(p => newDoc.addPage(p));
            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await newDoc.save();
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' }));
            });
            setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Failed to remove pages.'); setStatus('ready'); }
    };

    const markedCount = thumbs.filter(t => t.remove).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🗑️" title="Remove Pages" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="🗑️" 
                    title="PDF Remove Pages" 
                    description="Remove unwanted pages from your PDF document." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {thumbs.length > 0 && (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Click pages to mark for removal</p>
                                    {markedCount > 0 && <span className="text-xs text-red-400 font-medium">{markedCount} page{markedCount !== 1 ? 's' : ''} marked</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* Select All / Deselect All */}
                                    <div className="flex gap-1">
                                        <button
                                            onClick={selectAll}
                                            disabled={markedCount === thumbs.length}
                                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={deselectAll}
                                            disabled={markedCount === 0}
                                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-gray-700 text-gray-400 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Deselect All
                                        </button>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={showPreviews} onChange={(e) => setShowPreviews(e.target.checked)} className="rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500" />
                                        Show all page previews
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                {thumbs.map(t => (
                                    <button key={t.pageNum} onClick={() => toggleRemove(t.pageNum)}
                                        className={`relative rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${t.remove ? 'border-red-500 opacity-50' : 'border-gray-700 hover:border-gray-500'}`}>
                                        {t.url ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={t.url} alt={`Page ${t.pageNum}`} className="w-full block" />
                                        ) : (
                                            <div className="w-full aspect-[1/1.4] bg-gray-800 flex flex-col items-center justify-center text-gray-500">
                                                <span className="text-xs">Page</span>
                                                <span className="text-xl font-bold">{t.pageNum}</span>
                                            </div>
                                        )}
                                        {t.remove && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-red-500/30">
                                                <span className="text-red-300 text-2xl font-bold">✕</span>
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[10px] text-gray-300 py-0.5">{t.pageNum}</div>
                                    </button>
                                ))}
                            </div>
                            <ProcessingButton
                                onClick={handleRemove}
                                onCancel={() => { isCancelledRef.current = true; }}
                                disabled={markedCount === 0}
                                isProcessing={status === 'processing'}
                                idleLabel={`🗑️ Remove ${markedCount} Page${markedCount !== 1 ? 's' : ''}`}
                                processingLabel="Processing…"
                                className="bg-red-600 hover:bg-red-500"
                            />
                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`trimmed-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download PDF ({thumbs.length - markedCount} pages)
                                </a>
                            )}
                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
