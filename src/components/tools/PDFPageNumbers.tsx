'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function PDFPageNumbers() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Options
    const [position, setPosition] = useState<'bottom-center' | 'bottom-left' | 'bottom-right'>('bottom-center');
    const [startNum, setStartNum] = useState(1);
    const [fontSize, setFontSize] = useState(12);
    const [prefix, setPrefix] = useState('');

    const fileRef = useRef<File | null>(null);
    // Cache raw page 1 ImageData
    const page1Ref = useRef<ImageData | null>(null);
    const page1SizeRef = useRef<{ w: number; h: number } | null>(null);

    // ── Render preview overlay on canvas ────────────────────────────────
    const renderPreview = useCallback(() => {
        const raw = page1Ref.current;
        const size = page1SizeRef.current;
        if (!raw || !size) return;

        const canvas = document.createElement('canvas');
        canvas.width = size.w; canvas.height = size.h;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(raw.data), size.w, size.h), 0, 0);

        // Draw page number text
        const text = `${prefix}${startNum}`;
        const scaledFontSize = fontSize * 1.5; // match pdf-lib's 72dpi scale
        ctx.font = `${scaledFontSize}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(80,80,80,0.85)';
        ctx.textBaseline = 'bottom';

        const textWidth = ctx.measureText(text).width;
        let x: number;
        if (position === 'bottom-left') x = 20 * 1.5;
        else if (position === 'bottom-right') x = size.w - textWidth - 20 * 1.5;
        else x = (size.w - textWidth) / 2;
        const y = size.h - 14 * 1.5;

        ctx.fillText(text, x, y);
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    }, [position, startNum, fontSize, prefix]);

    // Re-render preview whenever options change
    useEffect(() => { renderPreview(); }, [renderPreview]);

    // ── Load page 1 on file select ────────────────────────────────────
    const loadPage1 = useCallback(async (file: File) => {
        setPreviewLoading(true); setPreviewUrl(null);
        page1Ref.current = null; page1SizeRef.current = null;
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
            const page = await doc.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as Parameters<typeof page.render>[0]).promise;
            const imageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            page1Ref.current = imageData;
            page1SizeRef.current = { w: canvas.width, h: canvas.height };
            renderPreview();
        } catch (e) { console.error(e); }
        finally { setPreviewLoading(false); }
    }, [renderPreview]);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('idle'); setDownloadUrl(null);
        loadPage1(file);
    };

    const handleProcess = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;
        try {
            const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const pages = doc.getPages();

            for (let i = 0; i < pages.length; i++) {
                if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
                setProgress(`Page ${i + 1}/${pages.length}…`);
                const page = pages[i];
                const { width } = page.getSize();
                const text = `${prefix}${startNum + i}`;
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                let x: number;
                if (position === 'bottom-left') x = 20;
                else if (position === 'bottom-right') x = width - textWidth - 20;
                else x = (width - textWidth) / 2;
                page.drawText(text, { x, y: 15, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
            }

            if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
            const outBytes = await doc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Failed to add page numbers.'); setStatus('error'); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔢" title="PDF Page Numbers" />
            <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="🔢" 
                    title="PDF Page Numbers" 
                    description="Add page numbers to your PDF with custom positioning and style." 
                />
                <div className="flex flex-col lg:flex-row gap-5">

                    {/* ── Left: Controls ── */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                            <DropZone onFile={handleFile} fileName={fileName} />
                            {fileName && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Position</label>
                                            <div className="flex flex-col gap-1.5">
                                                {(['bottom-left', 'bottom-center', 'bottom-right'] as const).map(p => (
                                                    <button key={p} onClick={() => setPosition(p)}
                                                        className={`py-2 px-3 rounded-lg text-sm text-left transition-all capitalize ${position === p ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                        {p.replace('-', ' ')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Start Number</label>
                                                <input type="number" min={1} value={startNum} onChange={e => setStartNum(parseInt(e.target.value) || 1)}
                                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Font Size</label>
                                                <input type="number" min={6} max={24} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value) || 10)}
                                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Prefix</label>
                                                <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. 'Page '"
                                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                    </div>

                                    <ProcessingButton
                                        onClick={handleProcess}
                                        onCancel={() => { isCancelledRef.current = true; }}
                                        isProcessing={status === 'processing'}
                                        idleLabel="🔢 Add Page Numbers"
                                        processingLabel={progress || 'Processing…'}
                                    />
                                    {status === 'done' && downloadUrl && (
                                        <a href={downloadUrl} download={`numbered-${fileName}`}
                                            className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                            ⬇️ Download PDF
                                        </a>
                                    )}
                                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Right: Live Preview ── */}
                    {(previewLoading || previewUrl) && (
                        <div className="lg:w-72 xl:w-96">
                            <div className="bg-gray-900 rounded-2xl border border-gray-700/50 overflow-hidden sticky top-20">
                                <div className="px-4 py-3 border-b border-gray-700/50">
                                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Live Preview — Page 1</p>
                                </div>
                                {previewLoading ? (
                                    <div className="h-48 flex items-center justify-center text-gray-500 text-sm gap-2">
                                        <span className="animate-spin">⏳</span> Loading…
                                    </div>
                                ) : (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={previewUrl!} alt="Page numbers preview" className="w-full block" />
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
