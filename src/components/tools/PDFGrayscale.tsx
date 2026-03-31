'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { canvasToBlob, canvasToObjectUrl, isPdfFile, loadPdfDocument, mapConcurrent, renderPdfPageToCanvas, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function PDFGrayscale() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [originalSize, setOriginalSize] = useState(0);
    const [outputSize, setOutputSize] = useState(0);
    const isCancelledRef = useRef(false);

    const fileRef = useRef<File | null>(null);
    const page1Ref = useRef<ImageData | null>(null);
    const page1SizeRef = useRef<{ w: number; h: number } | null>(null);

    const renderGrayscalePreview = useCallback(() => {
        const raw = page1Ref.current; const size = page1SizeRef.current;
        if (!raw || !size) return;
        const canvas = document.createElement('canvas');
        canvas.width = size.w; canvas.height = size.h;
        const ctx = canvas.getContext('2d')!;
        const copy = new ImageData(new Uint8ClampedArray(raw.data), size.w, size.h);
        const d = copy.data;
        for (let px = 0; px < d.length; px += 4) {
            const grey = Math.round(0.299 * d[px] + 0.587 * d[px + 1] + 0.114 * d[px + 2]);
            d[px] = d[px + 1] = d[px + 2] = grey;
        }
        ctx.putImageData(copy, 0, 0);

        canvasToObjectUrl(canvas, 'image/jpeg', 0.85)
            .then((url) => {
                setPreviewUrl((prev) => {
                    revokeObjectUrl(prev);
                    return url;
                });
            })
            .catch(console.error);
    }, []);

    useEffect(() => { renderGrayscalePreview(); }, [renderGrayscalePreview]);
    useEffect(() => () => revokeObjectUrl(previewUrl), [previewUrl]);
    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const loadPage1 = useCallback(async (file: File) => {
        setPreviewLoading(true); setPreviewUrl(null);
        page1Ref.current = null; page1SizeRef.current = null;
        try {
            const doc = await loadPdfDocument(await file.arrayBuffer());
            const canvas = await renderPdfPageToCanvas(doc, 1, { scale: 1.35, willReadFrequently: true });
            const imageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            page1Ref.current = imageData; page1SizeRef.current = { w: canvas.width, h: canvas.height };
            renderGrayscalePreview();
        } catch (e) { console.error(e); } finally { setPreviewLoading(false); }
    }, [renderGrayscalePreview]);

    const handleFile = (file: File) => {
        if (!isPdfFile(file)) { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setOriginalSize(file.size);
        setErrorMsg(''); setStatus('idle');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        loadPage1(file);
    };

    const handleProcess = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;
        try {
            const [{ PDFDocument }, buf] = await Promise.all([import('pdf-lib'), fileRef.current.arrayBuffer()]);
            const pdfjsDoc = await loadPdfDocument(buf);
            const outDoc = await PDFDocument.create();

            const pScale = 1.6;
            const pageNumbers = Array.from({ length: pdfjsDoc.numPages }, (_, i) => i + 1);

            const batchResults = await mapConcurrent(pageNumbers, 3, async (i: number) => {
                if (isCancelledRef.current) throw new Error('CANCELLED');
                setProgress(`Page ${i}/${pdfjsDoc.numPages}…`);
                const canvas = await renderPdfPageToCanvas(pdfjsDoc, i, { scale: pScale, willReadFrequently: true });
                const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imageData.data;
                const data32 = new Uint32Array(d.buffer);
                
                for (let px = 0; px < data32.length; px++) {
                    const val = data32[px];
                    const r = val & 0xFF;
                    const g = (val >> 8) & 0xFF;
                    const b = (val >> 16) & 0xFF;
                    const a = val & 0xFF000000;
                    const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    data32[px] = a | (grey << 16) | (grey << 8) | grey;
                }
                ctx.putImageData(imageData, 0, 0);
                const jpegBytes = await (await canvasToBlob(canvas, 'image/jpeg', 0.84)).arrayBuffer();
                return { jpegBytes, w: canvas.width, h: canvas.height };
            });

            for (const res of batchResults) {
                const img = await outDoc.embedJpg(res.jpegBytes);
                const p = outDoc.addPage([res.w / pScale, res.h / pScale]);
                p.drawImage(img, { x: 0, y: 0, width: res.w / pScale, height: res.h / pScale });
            }

            if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
            const outBytes = await outDoc.save();
            setOutputSize(outBytes.byteLength);
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' }));
            });
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Conversion failed.'); setStatus('error'); }
    };

    const fmt = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🌑" title="Grayscale PDF" />
            <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="🌑" 
                    title="PDF Grayscale" 
                    description="Convert your PDF to black and white to save ink and reduce file size." 
                />
                <div className="flex flex-col lg:flex-row gap-5">
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                            <DropZone onFile={handleFile} fileName={fileName} />
                            {fileName && (
                                <>
                                    <ProcessingButton
                                        onClick={handleProcess}
                                        onCancel={() => { isCancelledRef.current = true; }}
                                        isProcessing={status === 'processing'}
                                        idleLabel="🌑 Convert to Grayscale"
                                        processingLabel={progress || 'Processing…'}
                                    />
                                    {status === 'done' && downloadUrl && (
                                        <div className="flex flex-col gap-3">
                                            <div className="bg-gray-800 rounded-xl p-4 flex justify-between text-sm">
                                                <div><p className="text-gray-400 text-xs">Original</p><p className="font-semibold">{fmt(originalSize)}</p></div>
                                                <div className="text-right"><p className="text-gray-400 text-xs">Grayscale</p><p className="font-semibold">{fmt(outputSize)}</p></div>
                                            </div>
                                            <a href={downloadUrl} download={`grayscale-${fileName}`}
                                                className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                                ⬇️ Download Grayscale PDF
                                            </a>
                                        </div>
                                    )}
                                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                                </>
                            )}
                        </div>
                    </div>
                    {(previewLoading || previewUrl) && (
                        <div className="lg:w-72 xl:w-96">
                            <div className="bg-gray-900 rounded-2xl border border-gray-700/50 overflow-hidden sticky top-20">
                                <div className="px-4 py-3 border-b border-gray-700/50">
                                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Live Preview — Page 1 (Grayscale)</p>
                                </div>
                                {previewLoading
                                    ? <div className="h-48 flex items-center justify-center text-gray-500 text-sm gap-2"><span className="animate-spin">⏳</span> Loading…</div>
                                    // eslint-disable-next-line @next/next/no-img-element
                                    : <img src={previewUrl!} alt="Grayscale preview" className="w-full block" />}
                            </div>
                        </div>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
