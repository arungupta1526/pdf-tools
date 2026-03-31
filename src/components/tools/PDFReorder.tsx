'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { isPdfFile, loadPdfDocument, mapConcurrent, renderPdfPageImage, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

interface PageItem {
    pageNum: number;  // 1-indexed original page number
    thumb: string;    // data URL thumbnail
}

export default function PDFReorder() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [pages, setPages] = useState<PageItem[]>([]);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const isCancelledRef = useRef(false);

    const fileRef = useRef<File | null>(null);
    const pageThumbUrlsRef = useRef<string[]>([]);

    useEffect(() => {
        pageThumbUrlsRef.current = pages.map((page) => page.thumb);
    }, [pages]);
    useEffect(() => () => pageThumbUrlsRef.current.forEach(revokeObjectUrl), []);
    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const handleFile = useCallback(async (file: File) => {
        if (!isPdfFile(file)) { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file;
        setFileName(file.name);
        setErrorMsg('');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        setPages((prev) => {
            prev.forEach((page) => revokeObjectUrl(page.thumb));
            return [];
        });
        setStatus('loading');

        try {
            const pdfDoc = await loadPdfDocument(await file.arrayBuffer());
            const pageNumbers = Array.from({ length: pdfDoc.numPages }, (_, index) => index + 1);
            const thumbs = await mapConcurrent(pageNumbers, 3, async (pageNum) => ({
                pageNum,
                thumb: await renderPdfPageImage(pdfDoc, pageNum, { scale: 0.5, quality: 0.7 }),
            }));

            setPages(thumbs);
            setStatus('ready');
        } catch (e) {
            console.error(e);
            setErrorMsg('Could not load PDF pages.');
            setStatus('error');
        }
    }, []);

    // Drag handlers
    const onDragStart = (i: number) => setDragIdx(i);
    const onDragEnter = (i: number) => setDragOverIdx(i);
    const onDragEnd = () => {
        if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
            setPages(prev => {
                const next = [...prev];
                const [moved] = next.splice(dragIdx, 1);
                next.splice(dragOverIdx, 0, moved);
                return next;
            });
        }
        setDragIdx(null);
        setDragOverIdx(null);
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    const moveUp = (i: number) => {
        if (i === 0) return;
        setPages(prev => { const n = [...prev];[n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };
    const moveDown = (i: number) => {
        if (i === pages.length - 1) return;
        setPages(prev => { const n = [...prev];[n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    const reset = () => {
        setPages(prev => [...prev].sort((a, b) => a.pageNum - b.pageNum));
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    const handleProcess = async () => {
        if (!fileRef.current || pages.length === 0) return;
        setStatus('processing');
        isCancelledRef.current = false;

        try {
            const { PDFDocument } = await import('pdf-lib');
            const fileBytes = new Uint8Array(await fileRef.current.arrayBuffer());
            const srcDoc = await PDFDocument.load(fileBytes);
            const outDoc = await PDFDocument.create();

            const order = pages.map(p => p.pageNum - 1); // 0-indexed
            const copiedPages = await outDoc.copyPages(srcDoc, order);
            if (isCancelledRef.current) { setStatus('ready'); return; }
            copiedPages.forEach(p => outDoc.addPage(p));

            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(blob);
            });
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Failed to reorder pages.');
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔀" title="Reorder Pages" />
            <div className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="📑" 
                    title="PDF Reorder" 
                    description="Rearrange the pages of your PDF document exactly how you need." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {status === 'loading' && (
                        <div className="flex items-center justify-center gap-3 py-8 text-gray-400">
                            <span className="animate-spin text-2xl">⏳</span>
                            <span>Generating page thumbnails…</span>
                        </div>
                    )}

                    {(status === 'ready' || status === 'processing' || status === 'done') && pages.length > 0 && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-400">
                                    <span className="text-white font-semibold">{pages.length}</span> pages · drag to reorder
                                </p>
                                <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                                    ↺ Reset order
                                </button>
                            </div>

                            {/* Thumbnail Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                {pages.map((page, i) => (
                                    <div
                                        key={`${page.pageNum}-${i}`}
                                        draggable
                                        onDragStart={() => onDragStart(i)}
                                        onDragEnter={() => onDragEnter(i)}
                                        onDragEnd={onDragEnd}
                                        onDragOver={e => e.preventDefault()}
                                        className={`relative group rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing flex flex-col overflow-hidden select-none
                      ${dragIdx === i ? 'opacity-40 scale-95' : ''}
                      ${dragOverIdx === i && dragIdx !== i ? 'border-indigo-500 scale-105 shadow-lg shadow-indigo-500/20' : 'border-gray-700/50 hover:border-gray-500/50'}
                    `}
                                    >
                                        <div className="bg-white aspect-[3/4] overflow-hidden">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={page.thumb} alt={`Page ${page.pageNum}`} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="bg-gray-800 px-1.5 py-1 flex items-center justify-between">
                                            <span className="text-[10px] text-gray-400">{i + 1}</span>
                                            <span className="text-[9px] text-gray-600">p{page.pageNum}</span>
                                            <div className="flex gap-0.5">
                                                <button onClick={() => moveUp(i)} disabled={i === 0} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-20 transition-colors px-0.5">↑</button>
                                                <button onClick={() => moveDown(i)} disabled={i === pages.length - 1} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-20 transition-colors px-0.5">↓</button>
                                            </div>
                                        </div>
                                        {/* Drag indicator */}
                                        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded px-1 py-0.5">
                                            <span className="text-[9px] text-gray-300">⠿</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <ProcessingButton
                                onClick={handleProcess}
                                onCancel={() => { isCancelledRef.current = true; }}
                                isProcessing={status === 'processing'}
                                idleLabel="🔀 Apply New Order & Download"
                                processingLabel="Saving…"
                            />

                            {status === 'done' && downloadUrl && (
                                <a
                                    href={downloadUrl}
                                    download={`reordered-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                                >
                                    ⬇️ Download Reordered PDF
                                </a>
                            )}

                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}

                    {status === 'error' && errorMsg && (
                        <p className="text-red-400 text-sm text-center py-4">⚠️ {errorMsg}</p>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
