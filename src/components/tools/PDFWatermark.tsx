'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';

const COLOR_MAP: Record<string, [number, number, number]> = {
    gray: [0.5, 0.5, 0.5],
    red: [0.8, 0.1, 0.1],
    blue: [0.1, 0.2, 0.8],
};

const CANVAS_COLOR: Record<string, string> = {
    gray: 'rgba(100,100,100,',
    red: 'rgba(200,25,25,',
    blue: 'rgba(25,50,200,',
};

export default function PDFWatermark() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Options
    const [text, setText] = useState('CONFIDENTIAL');
    const [opacity, setOpacity] = useState(0.15);
    const [fontSize, setFontSize] = useState(48);
    const [position, setPosition] = useState<'diagonal' | 'center' | 'top' | 'bottom'>('diagonal');
    const [color, setColor] = useState<'gray' | 'red' | 'blue'>('gray');

    const fileRef = useRef<File | null>(null);
    const page1Ref = useRef<ImageData | null>(null);
    const page1SizeRef = useRef<{ w: number; h: number } | null>(null);

    // ── Draw watermark preview on canvas ──────────────────────────────
    const renderPreview = useCallback(() => {
        const raw = page1Ref.current;
        const size = page1SizeRef.current;
        if (!raw || !size || !text.trim()) return;

        const canvas = document.createElement('canvas');
        canvas.width = size.w; canvas.height = size.h;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(raw.data), size.w, size.h), 0, 0);

        // Scale font size to match canvas resolution (scale=1.5)
        const scaledFontSize = fontSize * 1.5;
        ctx.font = `bold ${scaledFontSize}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = `${CANVAS_COLOR[color]}${opacity})`;
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(text).width;

        if (position === 'diagonal') {
            ctx.save();
            ctx.translate(size.w / 2, size.h / 2);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(text, -textWidth / 2, 0);
            ctx.restore();
        } else {
            const x = (size.w - textWidth) / 2;
            let y: number;
            if (position === 'center') { y = size.h / 2; }
            else if (position === 'top') { y = scaledFontSize + 20; }
            else { y = size.h - scaledFontSize - 20; }
            ctx.fillText(text, x, y);
        }

        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    }, [text, opacity, fontSize, position, color]);

    useEffect(() => { renderPreview(); }, [renderPreview]);

    // ── Load page 1 ───────────────────────────────────────────────────
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
        if (!fileRef.current || !text.trim()) { setErrorMsg('Enter watermark text.'); return; }
        setStatus('processing'); setErrorMsg('');
        try {
            const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            const pages = doc.getPages();
            const [cr, cg, cb] = COLOR_MAP[color];

            for (let i = 0; i < pages.length; i++) {
                setProgress(`Page ${i + 1}/${pages.length}…`);
                const page = pages[i];
                const { width, height } = page.getSize();
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                const x = (width - textWidth) / 2;
                let y: number;
                let rotate = degrees(0);
                if (position === 'diagonal') { y = height / 2; rotate = degrees(45); }
                else if (position === 'center') { y = (height - fontSize) / 2; }
                else if (position === 'top') { y = height - fontSize - 30; }
                else { y = 30; }
                page.drawText(text, { x, y, size: fontSize, font, color: rgb(cr, cg, cb), opacity, rotate });
            }

            const outBytes = await doc.save();
            setDownloadUrl(URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' })));
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Failed to add watermark.'); setStatus('error'); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="💧" title="PDF Watermark" />
            <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
                <div className="flex flex-col lg:flex-row gap-5">

                    {/* ── Left: Controls ── */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                            <DropZone onFile={handleFile} fileName={fileName} />
                            {fileName && (
                                <>
                                    <div>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Watermark Text</label>
                                        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL"
                                            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Position</label>
                                            <div className="flex flex-col gap-1.5">
                                                {(['diagonal', 'center', 'top', 'bottom'] as const).map(p => (
                                                    <button key={p} onClick={() => setPosition(p)}
                                                        className={`py-2 px-3 rounded-lg text-sm text-left capitalize transition-all ${position === p ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Color</label>
                                                <div className="flex gap-2">
                                                    {(['gray', 'red', 'blue'] as const).map(c => (
                                                        <button key={c} onClick={() => setColor(c)}
                                                            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${color === c ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                            {c}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                                                    Opacity: {Math.round(opacity * 100)}%
                                                </label>
                                                <input type="range" min={5} max={60} step={5} value={Math.round(opacity * 100)}
                                                    onChange={e => setOpacity(parseInt(e.target.value) / 100)}
                                                    className="w-full accent-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                                                    Font Size: {fontSize}
                                                </label>
                                                <input type="range" min={20} max={80} step={4} value={fontSize}
                                                    onChange={e => setFontSize(parseInt(e.target.value))}
                                                    className="w-full accent-indigo-500" />
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={handleProcess} disabled={status === 'processing' || !text.trim()}
                                        className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                        {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress}</> : '💧 Add Watermark'}
                                    </button>
                                    {status === 'done' && downloadUrl && (
                                        <a href={downloadUrl} download={`watermarked-${fileName}`}
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
                                    <img src={previewUrl!} alt="Watermark preview" className="w-full block" />
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
