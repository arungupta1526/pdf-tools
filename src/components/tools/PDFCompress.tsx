'use client';

import React, { useState, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import PasswordPrompt from '@/components/PasswordPrompt';
import { canvasToBlob, loadPdfDocument, mapConcurrent, renderPdfPageToCanvas } from '@/lib/pdf-browser';
import { usePdfTool } from '@/hooks/usePdfTool';

type CompressMode = 'quality' | 'target';

const QUALITY_OPTIONS = [
    { label: 'Low', value: 0.4, desc: 'Smallest file' },
    { label: 'Medium', value: 0.65, desc: 'Balanced' },
    { label: 'High', value: 0.85, desc: 'Best quality' },
];

export default function PDFCompress() {
    const {
        status, setStatus,
        fileName,
        errorMsg, setErrorMsg,
        progress, setProgress,
        downloadUrl, setDownloadUrl,
        password,
        fileRef,
        isCancelledRef,
        handleFile,
        handleCancel,
        handlePasswordSubmit,
        handleError
    } = usePdfTool();

    const [quality, setQuality] = useState(0.65);
    const [originalSize, setOriginalSize] = useState(0);
    const [compressedSize, setCompressedSize] = useState(0);
    const [finalQuality, setFinalQuality] = useState<number | null>(null);

    // Target size mode
    const [compressMode, setCompressMode] = useState<CompressMode>('quality');
    const [targetValue, setTargetValue] = useState('500');
    const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');

    const onFileSelect = (file: File) => {
        if (handleFile(file, (f) => setOriginalSize(f.size))) {
            setFinalQuality(null);
        }
    };

    // ── Core: compress pages at a given quality, return Uint8Array ──
    const compressAtQuality = useCallback(async (
        pdfjsDoc: Awaited<ReturnType<typeof loadPdfDocument>>,
        PDFDocument: typeof import('pdf-lib')['PDFDocument'],
        q: number,
        onProgress?: (msg: string) => void,
        pageRange?: number[]
    ): Promise<Uint8Array> => {
        const outDoc = await PDFDocument.create();
        const pScale = 1.35;
        const pageNumbers = pageRange || Array.from({ length: pdfjsDoc.numPages }, (_, i) => i + 1);

        const batchResults = await mapConcurrent(pageNumbers, 3, async (i: number) => {
            if (isCancelledRef.current) throw new Error('CANCELLED');
            onProgress?.(`Page ${i}/${pdfjsDoc.numPages} (quality ${Math.round(q * 100)}%)…`);
            const canvas = await renderPdfPageToCanvas(pdfjsDoc, i, { scale: pScale });
            const jpegBytes = await (await canvasToBlob(canvas, 'image/jpeg', q)).arrayBuffer();
            return { jpegBytes, w: canvas.width, h: canvas.height };
        });

        for (const res of batchResults) {
            const img = await outDoc.embedJpg(res.jpegBytes);
            const p = outDoc.addPage([res.w / pScale, res.h / pScale]);
            p.drawImage(img, { x: 0, y: 0, width: res.w / pScale, height: res.h / pScale });
        }
        return outDoc.save();
    }, [isCancelledRef]);

    const handleCompress = async () => {
        if (!fileRef.current) return;
        setStatus('processing');
        setDownloadUrl(null);
        setFinalQuality(null);
        isCancelledRef.current = false;

        try {
            const [{ PDFDocument }, buf] = await Promise.all([
                import('pdf-lib'),
                fileRef.current.arrayBuffer(),
            ]);
            
            const pdfjsDoc = await loadPdfDocument(buf, password);

            let outBytes: Uint8Array;
            let usedQuality: number;

            if (compressMode === 'quality') {
                // ── Simple quality preset ───────────────────────────────────────
                outBytes = await compressAtQuality(pdfjsDoc, PDFDocument, quality, msg => setProgress(msg));
                usedQuality = quality;
            } else {
                // ── Target size mode — binary search optimized ───────────────────
                const targetNum = parseFloat(targetValue);
                if (isNaN(targetNum) || targetNum <= 0) { 
                    setErrorMsg('Enter a valid target size.'); 
                    setStatus('idle'); 
                    return; 
                }
                const targetBytes = targetNum * (targetUnit === 'MB' ? 1024 * 1024 : 1024);

                if (targetBytes >= originalSize) {
                    setErrorMsg('Target size is larger than the original — no compression needed.');
                    setStatus('idle'); 
                    return;
                }

                let lo = 0.1, hi = 0.92;
                let iter = 0;
                
                // Pick middle page for testing to represent average complexity
                const testPageNum = Math.max(1, Math.floor(pdfjsDoc.numPages / 2));

                while (hi - lo > 0.02) {
                    iter++;
                    const mid = (lo + hi) / 2;
                    setProgress(`Pass ${iter}: testing quality ${Math.round(mid * 100)}% on page ${testPageNum}…`);
                    const candidate = await compressAtQuality(pdfjsDoc, PDFDocument, mid, msg => setProgress(`Pass ${iter}: ${msg}`), [testPageNum]);
                    const extrapolatedSize = candidate.byteLength * pdfjsDoc.numPages;
                    if (extrapolatedSize <= targetBytes) { lo = mid; } // fits → try higher quality
                    else { hi = mid; }                                 // too big → lower quality
                }

                // Final pass at lo quality (closest that fits target)
                setProgress('Final compression pass on all pages…');
                outBytes = await compressAtQuality(pdfjsDoc, PDFDocument, lo, msg => setProgress(`Finalizing: ${msg}`));
                usedQuality = lo;
            }

            setCompressedSize(outBytes.byteLength);
            setFinalQuality(usedQuality);
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setProgress(''); 
            setStatus('done');
        } catch (e) { 
            if (e instanceof Error && e.message === 'CANCELLED') {
                setStatus('idle'); 
                setProgress(''); 
                return;
            }
            handleError(e, 'Compression failed.');
        }
    };

    const savings = originalSize > 0 && compressedSize > 0
        ? Math.round((1 - compressedSize / originalSize) * 100) : 0;
    const fmt = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🗜️" title="PDF Compress" />
            <div className="flex-1 p-6 max-w-xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="📉" 
                    title="PDF Compress" 
                    description="Reduce the file size of your PDF while maintaining optimal quality." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={onFileSelect} fileName={fileName} />

                    {status === 'needs_password' && (
                        <PasswordPrompt 
                            onSubmit={(pwd) => {
                                handlePasswordSubmit(pwd);
                                setTimeout(handleCompress, 100);
                            }}
                            onCancel={() => setStatus('idle')}
                            errorMsg={errorMsg}
                        />
                    )}

                    {fileName && status !== 'needs_password' && (
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

                            {/* Raster compression warning */}
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-300 text-xs flex gap-2">
                                <span className="shrink-0">⚠️</span>
                                <span>
                                    <strong>Note:</strong> Compression re-renders pages as JPEG images. Vector content, selectable text, fonts, and hyperlinks will be converted to raster — original quality cannot be recovered from the output.
                                </span>
                            </div>
                            <ProcessingButton
                                onClick={handleCompress}
                                onCancel={handleCancel}
                                isProcessing={status === 'processing'}
                                idleLabel="🗜️ Compress PDF"
                                processingLabel={progress || 'Processing…'}
                            />

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
