'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import DropZone from '@/components/DropZone';
import { isPdfFile, loadPdfDocument, mapConcurrent, renderPdfPageImage, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

interface PageThumb { pageNum: number; url: string; remove: boolean; }

export default function PDFRemovePages() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [thumbs, setThumbs] = useState<PageThumb[]>([]);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const fileRef = useRef<File | null>(null);
    const thumbUrlsRef = useRef<string[]>([]);

    useEffect(() => {
        thumbUrlsRef.current = thumbs.map((thumb) => thumb.url);
    }, [thumbs]);
    useEffect(() => () => thumbUrlsRef.current.forEach(revokeObjectUrl), []);
    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const loadThumbs = useCallback(async (file: File) => {
        setStatus('loading');
        setThumbs((prev) => {
            prev.forEach((thumb) => revokeObjectUrl(thumb.url));
            return [];
        });
        try {
            const doc = await loadPdfDocument(await file.arrayBuffer());
            const pageNumbers = Array.from({ length: doc.numPages }, (_, index) => index + 1);
            const results = await mapConcurrent(pageNumbers, 3, async (pageNum) => ({
                pageNum,
                url: await renderPdfPageImage(doc, pageNum, { scale: 0.4, quality: 0.7 }),
                remove: false,
            }));
            setThumbs(results); setStatus('ready');
        } catch (e) { console.error(e); setErrorMsg('Failed to load PDF.'); setStatus('error'); }
    }, []);

    const handleFile = (file: File) => {
        if (!isPdfFile(file)) { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg('');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        loadThumbs(file);
    };

    const toggleRemove = (n: number) => setThumbs(prev => prev.map(t => t.pageNum === n ? { ...t, remove: !t.remove } : t));

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
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Click pages to mark for removal</p>
                                {markedCount > 0 && <span className="text-xs text-red-400 font-medium">{markedCount} page{markedCount !== 1 ? 's' : ''} marked</span>}
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                {thumbs.map(t => (
                                    <button key={t.pageNum} onClick={() => toggleRemove(t.pageNum)}
                                        className={`relative rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${t.remove ? 'border-red-500 opacity-50' : 'border-gray-700 hover:border-gray-500'}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={t.url} alt={`Page ${t.pageNum}`} className="w-full block" />
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
