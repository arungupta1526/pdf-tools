'use client';

import React, { useState, useRef, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

interface PageItem { pageNum: number; url: string; rotation: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsDoc = any;

export default function PDFRotate() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [pages, setPages] = useState<PageItem[]>([]);
    const [globalRotation, setGlobalRotation] = useState(0);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const fileRef = useRef<File | null>(null);
    const pdfjsDocRef = useRef<PdfjsDoc>(null);

    const loadThumbs = useCallback(async (file: File) => {
        setStatus('loading'); setPages([]);
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const doc = await pdfjs.getDocument({ 
                data: new Uint8Array(await file.arrayBuffer()),
                cMapUrl: '/cmaps/',
                cMapPacked: true,
            }).promise;
            pdfjsDocRef.current = doc;
            const results: PageItem[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const viewport = page.getViewport({ scale: 0.35 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as Parameters<typeof page.render>[0]).promise;
                results.push({ pageNum: i, url: canvas.toDataURL('image/jpeg', 0.6), rotation: 0 });
            }
            setPages(results); setStatus('ready');
        } catch (e) { console.error(e); setErrorMsg('Failed to load PDF.'); setStatus('error'); }
    }, []);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); loadThumbs(file);
    };

    const rotatePage = (n: number, deg: number) =>
        setPages(prev => prev.map(p => p.pageNum === n ? { ...p, rotation: ((p.rotation + deg) % 360 + 360) % 360 } : p));

    const applyGlobalRotation = (deg: number) => {
        setGlobalRotation(deg);
        setPages(prev => prev.map(p => ({ ...p, rotation: ((deg) % 360 + 360) % 360 })));
    };

    const handleSave = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;
        try {
            const { PDFDocument, degrees } = await import('pdf-lib');
            const srcBytes = await fileRef.current.arrayBuffer();
            const doc = await PDFDocument.load(srcBytes);
            const pdfPages = doc.getPages();
            for (const { pageNum, rotation } of pages) {
                if (isCancelledRef.current) { setStatus('ready'); return; }
                pdfPages[pageNum - 1].setRotation(degrees(rotation));
            }
            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await doc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Rotation failed.'); setStatus('ready'); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔃" title="PDF Rotate" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="🔄" 
                    title="PDF Rotate" 
                    description="Rotate your PDF pages to portrait or landscape orientation." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {pages.length > 0 && (
                        <>
                            <div>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Rotate All Pages</p>
                                <div className="flex gap-2 flex-wrap">
                                    {[90, 180, 270].map(deg => (
                                        <button key={deg} onClick={() => applyGlobalRotation(deg)}
                                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${globalRotation === deg ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                            {deg === 90 ? '↻ 90°' : deg === 180 ? '↕ 180°' : '↺ 270°'}
                                        </button>
                                    ))}
                                    <button onClick={() => applyGlobalRotation(0)}
                                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 text-gray-400 hover:text-white transition-all">Reset</button>
                                </div>
                            </div>
                            <ProcessingButton
                                onClick={handleSave}
                                onCancel={() => { isCancelledRef.current = true; }}
                                isProcessing={status === 'processing'}
                                idleLabel="🔃 Apply Rotation"
                                processingLabel="Saving…"
                            />
                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`rotated-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download Rotated PDF
                                </a>
                            )}
                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>
                {pages.length > 0 && (
                    <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-4">Individual Pages (click ↻/↺ to rotate)</p>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                            {pages.map(p => (
                                <div key={p.pageNum} className="flex flex-col items-center gap-2">
                                    <div className="relative rounded-lg overflow-hidden border border-gray-700 w-full">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.url} alt={`Page ${p.pageNum}`} className="w-full block transition-all"
                                            style={{ transform: `rotate(${p.rotation}deg)` }} />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => rotatePage(p.pageNum, -90)} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center justify-center transition-colors">↺</button>
                                        <span className="text-xs text-gray-400 w-6 text-center">{p.pageNum}</span>
                                        <button onClick={() => rotatePage(p.pageNum, 90)} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center justify-center transition-colors">↻</button>
                                    </div>
                                    <span className="text-[10px] text-gray-500">{p.rotation}°</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
