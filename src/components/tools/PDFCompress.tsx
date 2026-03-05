'use client';

import React, { useState, useRef, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';
type CompressMode = 'quality' | 'target';

const QUALITY_OPTIONS = [
    { label: 'Low', value: 0.4, desc: 'Smallest file' },
    { label: 'Medium', value: 0.65, desc: 'Balanced' },
    { label: 'High', value: 0.85, desc: 'Best quality' },
];

export default function PDFCompress() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [quality, setQuality] = useState(0.65);
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [originalSize, setOriginalSize] = useState(0);
    const [compressedSize, setCompressedSize] = useState(0);
    const [finalQuality, setFinalQuality] = useState<number | null>(null);

    // Target size mode
    const [compressMode, setCompressMode] = useState<CompressMode>('quality');
    const [targetValue, setTargetValue] = useState('500');
    const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');

    const fileRef = useRef<File | null>(null);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name);
        setOriginalSize(file.size); setErrorMsg(''); setStatus('idle');
        setDownloadUrl(null); setFinalQuality(null);
    };

    // ── Core: compress all pages at a given quality, return Uint8Array ──
    const compressAtQuality = useCallback(async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfjsDoc: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        PDFDocument: any,
        q: number,
        onProgress?: (msg: string) => void
    ): Promise<Uint8Array> => {
        const outDoc = await PDFDocument.create();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
            onProgress?.(`Page ${i}/${pdfjsDoc.numPages} (quality ${Math.round(q * 100)}%)…`);
            const page = await pdfjsDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
            const jpegBytes = await fetch(canvas.toDataURL('image/jpeg', q)).then(r => r.arrayBuffer());
            const img = await outDoc.embedJpg(jpegBytes);
            const p = outDoc.addPage([viewport.width / 1.5, viewport.height / 1.5]);
            p.drawImage(img, { x: 0, y: 0, width: viewport.width / 1.5, height: viewport.height / 1.5 });
        }
        return outDoc.save();
    }, []);

    const handleCompress = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg(''); setDownloadUrl(null); setFinalQuality(null);

        try {
            const [pdfjs, { PDFDocument }] = await Promise.all([
                import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdf-lib'),
            ]);
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const buf = await fileRef.current.arrayBuffer();
            const pdfjsDoc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

            let outBytes: Uint8Array;
            let usedQuality: number;

            if (compressMode === 'quality') {
                // ── Simple quality preset ───────────────────────────────────────
                outBytes = await compressAtQuality(pdfjsDoc, PDFDocument, quality, msg => setProgress(msg));
                usedQuality = quality;
            } else {
                // ── Target size mode — binary search ───────────────────────────
                const targetNum = parseFloat(targetValue);
                if (isNaN(targetNum) || targetNum <= 0) { setErrorMsg('Enter a valid target size.'); setStatus('idle'); return; }
                const targetBytes = targetNum * (targetUnit === 'MB' ? 1024 * 1024 : 1024);

                if (targetBytes >= originalSize) {
                    setErrorMsg('Target size is larger than the original — no compression needed.');
                    setStatus('idle'); return;
                }

                let lo = 0.1, hi = 0.92, bestBytes: Uint8Array | null = null, bestQ = 0.5;
                let iter = 0;

                while (hi - lo > 0.02) {
                    iter++;
                    const mid = (lo + hi) / 2;
                    setProgress(`Pass ${iter}: testing quality ${Math.round(mid * 100)}%…`);
                    const candidate = await compressAtQuality(pdfjsDoc, PDFDocument, mid, msg => setProgress(`Pass ${iter}: ${msg}`));
                    bestBytes = candidate; bestQ = mid;
                    if (candidate.byteLength <= targetBytes) { lo = mid; } // fits → try higher quality
                    else { hi = mid; }                                       // too big → lower quality
                }

                // Final pass at lo quality (closest that fits target)
                setProgress('Final compression pass…');
                outBytes = await compressAtQuality(pdfjsDoc, PDFDocument, lo, msg => setProgress(`Finalizing: ${msg}`));
                usedQuality = lo;
                // If final is still bigger than target (edge case), use bestBytes
                if (outBytes.byteLength > targetBytes && bestBytes) {
                    outBytes = bestBytes; usedQuality = bestQ;
                }
            }

            setCompressedSize(outBytes.byteLength);
            setFinalQuality(usedQuality);
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Compression failed.'); setStatus('error'); }
    };

    const savings = originalSize > 0 && compressedSize > 0
        ? Math.round((1 - compressedSize / originalSize) * 100) : 0;
    const fmt = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🗜️" title="PDF Compress" />
            <div className="flex-1 p-6 max-w-xl mx-auto w-full flex flex-col gap-5">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {fileName && (
                        <>
                            {/* ── Mode Tabs ── */}
                            <div className="flex gap-2 p-1 bg-gray-800 rounded-xl">
                                <button onClick={() => setCompressMode('quality')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${compressMode === 'quality' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                                    🎚️ Quality Preset
                                </button>
                                <button onClick={() => setCompressMode('target')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${compressMode === 'target' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                                    🎯 Target Size
                                </button>
                            </div>

                            {/* ── Quality Presets ── */}
                            {compressMode === 'quality' && (
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Quality</label>
                                    <div className="flex gap-2">
                                        {QUALITY_OPTIONS.map(q => (
                                            <button key={q.label} onClick={() => setQuality(q.value)}
                                                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex flex-col items-center ${quality === q.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                <span>{q.label}</span>
                                                <span className="text-xs opacity-70">{q.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Target Size ── */}
                            {compressMode === 'target' && (
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                                        Target File Size <span className="text-gray-600 normal-case font-normal">(original: {fmt(originalSize)})</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number" min={1} value={targetValue}
                                            onChange={e => setTargetValue(e.target.value)}
                                            placeholder="e.g. 500"
                                            className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <div className="flex bg-gray-800 border border-gray-600 rounded-xl overflow-hidden">
                                            {(['KB', 'MB'] as const).map(u => (
                                                <button key={u} onClick={() => setTargetUnit(u)}
                                                    className={`px-5 text-sm font-semibold transition-all ${targetUnit === u ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                                                    {u}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1.5">
                                        The tool runs as many passes as needed to get closest to your target.
                                    </p>
                                </div>
                            )}

                            <button onClick={handleCompress} disabled={status === 'processing'}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress || 'Processing…'}</> : '🗜️ Compress PDF'}
                            </button>

                            {status === 'done' && downloadUrl && (
                                <div className="flex flex-col gap-3">
                                    <div className="bg-gray-800 rounded-xl p-4 grid grid-cols-3 text-sm gap-2">
                                        <div>
                                            <p className="text-gray-400 text-xs mb-0.5">Original</p>
                                            <p className="font-semibold">{fmt(originalSize)}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-gray-400 text-xs mb-0.5">Saved</p>
                                            <p className={`font-bold text-lg ${savings > 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>{savings}%</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-gray-400 text-xs mb-0.5">Result</p>
                                            <p className="font-semibold">{fmt(compressedSize)}</p>
                                        </div>
                                        {compressMode === 'target' && finalQuality !== null && (
                                            <p className="col-span-3 text-center text-xs text-gray-500 mt-1">
                                                Final quality used: {Math.round(finalQuality * 100)}%
                                            </p>
                                        )}
                                    </div>
                                    <a href={downloadUrl} download={`compressed-${fileName}`}
                                        className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                        ⬇️ Download Compressed PDF
                                    </a>
                                </div>
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
