'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

type Status = 'idle' | 'processing' | 'done' | 'error';

// ─── Color helpers ────────────────────────────────────────────────────────────

function invertPixel(
    r: number, g: number, b: number,
    target: [number, number, number] | null
): [number, number, number] {
    if (target) {
        const brightness = (r + g + b) / (3 * 255);
        return [
            Math.round(255 - target[0] * brightness),
            Math.round(255 - target[1] * brightness),
            Math.round(255 - target[2] * brightness),
        ];
    }
    return [255 - r, 255 - g, 255 - b];
}

function hexToRgb(hex: string): [number, number, number] | null {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    const num = parseInt(clean, 16);
    if (isNaN(num)) return null;
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function extractDominantColors(data: Uint8ClampedArray, w: number, h: number, count = 8): string[] {
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 2000)));
    const buckets = new Map<string, number>();
    for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4;
            if (data[i + 3] < 128) continue;
            const key = `${Math.round(data[i] / 32) * 32},${Math.round(data[i + 1] / 32) * 32},${Math.round(data[i + 2] / 32) * 32}`;
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
    }
    return [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count * 3)
        .map(([k]) => { const [r, g, b] = k.split(',').map(Number); return rgbToHex(Math.min(255, r), Math.min(255, g), Math.min(255, b)); })
        .filter((hex) => { const rgb = hexToRgb(hex); if (!rgb) return false; const lum = rgb[0] + rgb[1] + rgb[2]; return lum > 80 && lum < 700; })
        .slice(0, count);
}

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsDoc = any;

export default function PDFInverter() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [hexColor, setHexColor] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [swatches, setSwatches] = useState<string[]>([]);

    // Preview state
    const [totalPages, setTotalPages] = useState(0);
    const [pageNum, setPageNum] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const [invertedUrl, setInvertedUrl] = useState<string | null>(null);

    // Download
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadName, setDownloadName] = useState('');
    const [progress, setProgress] = useState('');

    const fileRef = useRef<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const colorPickerRef = useRef<HTMLInputElement>(null);
    const pdfjsDocRef = useRef<PdfjsDoc>(null);
    // Cache: pageNum → raw ImageData
    const pageCache = useRef<Map<number, { data: ImageData; w: number; h: number }>>(new Map());

    // ── Render inverted preview from cached ImageData ─────────────────────
    const renderInverted = useCallback((rawData: ImageData, w: number, h: number, target: [number, number, number] | null) => {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        const copy = new ImageData(new Uint8ClampedArray(rawData.data), w, h);
        const d = copy.data;
        for (let px = 0; px < d.length; px += 4) {
            const [nr, ng, nb] = invertPixel(d[px], d[px + 1], d[px + 2], target);
            d[px] = nr; d[px + 1] = ng; d[px + 2] = nb;
        }
        ctx.putImageData(copy, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.80);
    }, []);

    // ── Load a specific page (with cache) ─────────────────────────────────
    const loadPage = useCallback(async (pageNumber: number, skipSwatches = false) => {
        const doc = pdfjsDocRef.current;
        if (!doc) return;
        setPreviewLoading(true);
        try {
            let cached = pageCache.current.get(pageNumber);
            if (!cached) {
                const page = await doc.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                const ctx = canvas.getContext('2d')!;
                await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                cached = { data: imageData, w: canvas.width, h: canvas.height };
                pageCache.current.set(pageNumber, cached);
            }

            // Original preview
            const origCanvas = document.createElement('canvas');
            origCanvas.width = cached.w; origCanvas.height = cached.h;
            origCanvas.getContext('2d')!.putImageData(cached.data, 0, 0);
            setOriginalUrl(origCanvas.toDataURL('image/jpeg', 0.80));

            // Extract swatches from page 1 only
            if (!skipSwatches && pageNumber === 1) {
                setSwatches(extractDominantColors(cached.data.data, cached.w, cached.h));
            }

            // Inverted preview
            const target = hexColor.length > 0 ? hexToRgb(hexColor) : null;
            setInvertedUrl(renderInverted(cached.data, cached.w, cached.h, target));
        } catch (e) {
            console.error('Page load error', e);
        } finally {
            setPreviewLoading(false);
        }
    }, [hexColor, renderInverted]);

    // When hexColor changes, re-render just the inverted side from cache
    useEffect(() => {
        const cached = pageCache.current.get(pageNum);
        if (!cached) return;
        const target = hexColor.length > 0 ? hexToRgb(hexColor) : null;
        if (hexColor.length > 0 && !target) return;
        setInvertedUrl(renderInverted(cached.data, cached.w, cached.h, target));
    }, [hexColor, pageNum, renderInverted]);

    // ── Initialize pdfjs and load page 1 on file select ──────────────────
    const initPdf = useCallback(async (file: File) => {
        setPreviewLoading(true);
        setOriginalUrl(null);
        setInvertedUrl(null);
        setSwatches([]);
        setDownloadUrl(null);
        pageCache.current.clear();
        pdfjsDocRef.current = null;

        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url
            ).toString();
            const buf = await file.arrayBuffer();
            const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
            pdfjsDocRef.current = doc;
            setTotalPages(doc.numPages);
            setPageNum(1);
            setPageInput('1');
            await loadPage(1, false);
        } catch (e) {
            console.error('PDF init error', e);
            setErrorMsg('Failed to read PDF.');
        } finally {
            setPreviewLoading(false);
        }
    }, [loadPage]);

    const handleFile = useCallback((file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF file.'); return; }
        fileRef.current = file;
        setFileName(file.name);
        setStatus('idle');
        setErrorMsg('');
        initPdf(file);
    }, [initPdf]);

    // ── Page navigation ────────────────────────────────────────────────────
    const goToPage = useCallback((n: number) => {
        if (!totalPages || n < 1 || n > totalPages) return;
        setPageNum(n);
        setPageInput(String(n));
        loadPage(n, true);
    }, [totalPages, loadPage]);

    const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const n = parseInt(pageInput, 10);
            if (!isNaN(n)) goToPage(n);
        }
    };

    // ── Full PDF processing ────────────────────────────────────────────────
    const processFile = useCallback(async (file: File) => {
        setStatus('processing');
        setDownloadUrl(null);
        setErrorMsg('');
        setProgress('Loading…');
        try {
            const targetRgb = hexColor.length > 0 ? hexToRgb(hexColor) : null;
            if (hexColor.length > 0 && !targetRgb) { setErrorMsg('Invalid hex color.'); setStatus('error'); return; }

            const [pdfjs, { PDFDocument }] = await Promise.all([
                import('pdfjs-dist/legacy/build/pdf.mjs'),
                import('pdf-lib'),
            ]);
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();

            const buf = await file.arrayBuffer();
            const pdfjsDoc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
            const outDoc = await PDFDocument.create();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            for (let i = 1; i <= pdfjsDoc.numPages; i++) {
                setProgress(`Page ${i} / ${pdfjsDoc.numPages}…`);
                const page = await pdfjsDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2 });
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imageData.data;
                for (let px = 0; px < d.length; px += 4) {
                    const [nr, ng, nb] = invertPixel(d[px], d[px + 1], d[px + 2], targetRgb);
                    d[px] = nr; d[px + 1] = ng; d[px + 2] = nb;
                }
                ctx.putImageData(imageData, 0, 0);
                const jpegBytes = await fetch(canvas.toDataURL('image/jpeg', 0.92)).then((r) => r.arrayBuffer());
                const img = await outDoc.embedJpg(jpegBytes);
                const pdfPage = outDoc.addPage([viewport.width / 2, viewport.height / 2]);
                pdfPage.drawImage(img, { x: 0, y: 0, width: viewport.width / 2, height: viewport.height / 2 });
            }

            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setDownloadName(`inverted-${file.name}`);
            setProgress('');
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Processing failed. Ensure the PDF is valid and not encrypted.');
            setStatus('error');
            setProgress('');
        }
    }, [hexColor]);

    const isHexValid = hexColor.length === 0 || hexToRgb(hexColor) !== null;
    const previewColor = isHexValid && hexColor.startsWith('#') && hexColor.length === 7 ? hexColor : null;

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col items-center py-10 px-4">

            {/* Header */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/30">🔄</div>
                    <h1 className="text-3xl font-extrabold tracking-tight">PDF Invert</h1>
                </div>
                <p className="text-gray-400 text-sm max-w-xs mx-auto">Invert your PDF&apos;s colors — standard or with a custom tint.</p>
            </div>

            <div className="w-full max-w-2xl flex flex-col gap-5">

                {/* ── Control Card ── */}
                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">

                    {/* Drop Zone */}
                    <div
                        className="relative m-5 rounded-xl border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors cursor-pointer bg-gray-800/40 hover:bg-gray-800/70 flex flex-col items-center justify-center py-7 px-6 gap-2"
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => inputRef.current?.click()}
                        role="button" aria-label="Upload PDF"
                    >
                        <div className="text-4xl opacity-60">📄</div>
                        {fileName ? (
                            <div className="text-center">
                                <p className="text-indigo-400 font-semibold break-all text-sm">{fileName}</p>
                                <p className="text-gray-500 text-xs mt-0.5">Click or drop to replace</p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-gray-300 font-medium">Drop your PDF here</p>
                                <p className="text-gray-500 text-xs mt-0.5">or click to browse</p>
                            </div>
                        )}
                        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    </div>

                    <div className="px-5 pb-5 flex flex-col gap-4">

                        {/* ── Color Section ── */}
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2.5">
                                Custom Invert Color <span className="text-gray-600 font-normal normal-case">(optional)</span>
                            </label>

                            {swatches.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs text-gray-500 mb-2">Colors from your PDF — click to select:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {swatches.map((hex) => (
                                            <button key={hex} title={hex} onClick={() => setHexColor(hex)}
                                                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 active:scale-95 ${hexColor === hex ? 'border-white shadow-md scale-110' : 'border-gray-600 hover:border-gray-400'}`}
                                                style={{ backgroundColor: hex }} />
                                        ))}
                                        <button onClick={() => setHexColor('')} title="Standard invert"
                                            className="w-8 h-8 rounded-lg border-2 border-gray-600 hover:border-gray-400 bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white text-xs transition-all hover:scale-110">✕</button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <div className="relative w-10 h-10 rounded-lg border border-gray-600 shrink-0 cursor-pointer overflow-hidden hover:border-indigo-400 transition-colors"
                                    style={{ backgroundColor: previewColor ?? '#1f2937' }} onClick={() => colorPickerRef.current?.click()}>
                                    <input ref={colorPickerRef} type="color" value={previewColor ?? '#ffffff'}
                                        onChange={(e) => setHexColor(e.target.value)}
                                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" aria-label="Color picker" />
                                </div>
                                <input id="hex-input" type="text" value={hexColor} onChange={(e) => setHexColor(e.target.value)}
                                    placeholder="#RRGGBB — leave empty for standard invert" maxLength={7}
                                    className={`flex-1 bg-gray-800 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 transition-all ${isHexValid ? 'border-gray-600 focus:ring-indigo-500 focus:border-indigo-500' : 'border-red-500 focus:ring-red-500'}`} />
                            </div>
                            {!isHexValid && <p className="text-red-400 text-xs mt-1.5">⚠ Use format #RRGGBB (e.g. #FF5733)</p>}
                        </div>

                        {/* ── Invert Button ── */}
                        <button id="invert-btn"
                            onClick={() => fileRef.current && processFile(fileRef.current)}
                            disabled={!fileName || !isHexValid || status === 'processing'}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                            {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress || 'Processing…'}</> : <>🔄 Invert PDF</>}
                        </button>

                        {status === 'done' && downloadUrl && (
                            <a id="download-btn" href={downloadUrl} download={downloadName}
                                className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                                ⬇️ Download Inverted PDF
                            </a>
                        )}

                        {status === 'error' && errorMsg && (
                            <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 text-red-400 text-sm">⚠️ {errorMsg}</div>
                        )}
                    </div>
                </div>

                {/* ── Preview Section ── */}
                {(previewLoading || originalUrl) && (
                    <div className="bg-gray-900 rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">

                        {/* Page Navigation Bar */}
                        <div className="px-5 py-3 border-b border-gray-700/50 flex items-center justify-between gap-4">
                            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Preview</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1 || previewLoading}
                                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center text-sm transition-colors">‹</button>

                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="number" min={1} max={totalPages || 1} value={pageInput}
                                        onChange={(e) => setPageInput(e.target.value)}
                                        onKeyDown={handlePageInputKeyDown}
                                        onBlur={() => { const n = parseInt(pageInput, 10); if (!isNaN(n)) goToPage(n); }}
                                        className="w-14 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white text-center outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    {totalPages > 0 && <span className="text-xs text-gray-500">/ {totalPages}</span>}
                                </div>

                                <button onClick={() => goToPage(pageNum + 1)} disabled={pageNum >= totalPages || previewLoading}
                                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center text-sm transition-colors">›</button>
                            </div>
                            {previewLoading && <span className="text-xs text-gray-500 animate-pulse">Loading…</span>}
                        </div>

                        {/* Dual Preview: Original | Inverted */}
                        <div className="grid grid-cols-2 divide-x divide-gray-700/50">
                            {/* Original */}
                            <div>
                                <div className="px-4 py-2 border-b border-gray-700/50">
                                    <p className="text-xs text-gray-500 font-medium">Original</p>
                                </div>
                                {originalUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={originalUrl} alt={`Original page ${pageNum}`} className="w-full block" />
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">—</div>
                                )}
                            </div>

                            {/* Inverted */}
                            <div>
                                <div className="px-4 py-2 border-b border-gray-700/50 flex items-center justify-between">
                                    <p className="text-xs text-gray-500 font-medium">Inverted</p>
                                    {status === 'done' && <span className="text-xs text-emerald-400">✅ PDF ready</span>}
                                </div>
                                {invertedUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={invertedUrl} alt={`Inverted page ${pageNum}`} className="w-full block" />
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">—</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <p className="mt-10 text-gray-600 text-xs">🔒 100% local — your PDF never leaves your device.</p>
        </main>
    );
}
