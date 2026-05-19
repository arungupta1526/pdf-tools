'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import PasswordPrompt from '@/components/PasswordPrompt';
import SignaturePad from '@/components/SignaturePad';
import { canvasToObjectUrl, loadPdfDocument, renderPdfPageToCanvas, revokeObjectUrl, type PdfJsDocument } from '@/lib/pdf-browser';
import { usePdfTool } from '@/hooks/usePdfTool';

const MM = 2.835; // mm to PDF points

export default function PDFSign() {
    const {
        status, setStatus,
        fileName,
        errorMsg, setErrorMsg,
        downloadUrl, setDownloadUrl,
        password,
        fileRef,
        isCancelledRef,
        handleFile,
        handleCancel,
        handlePasswordSubmit,
        handleError
    } = usePdfTool();

    const [pageCount, setPageCount] = useState(0);
    const [targetPage, setTargetPage] = useState(1);
    const [pageThumb, setPageThumb] = useState<string | null>(null);
    const [pageThumbW, setPageThumbW] = useState(0);
    const [pageThumbH, setPageThumbH] = useState(0);
    const [pageRealW, setPageRealW] = useState(595);

    // Signature data (from SignaturePad component)
    const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);

    // Placement (mm)
    const [sigX, setSigX] = useState(50);
    const [sigY, setSigY] = useState(20);
    const [sigW, setSigW] = useState(60);
    const [isSelected, setIsSelected] = useState(false);

    const [dragInfo, setDragInfo] = useState<{ startX: number; startY: number; initialX: number; initialY: number; initialScrollY: number } | null>(null);
    const pdfJsDocRef = useRef<PdfJsDocument | null>(null);

    // ─── Load PDF & render first page thumbnail ───────────────────────────────
    const loadPdfThumbnails = useCallback(async (file: File, pwd?: string) => {
        setStatus('loading');
        try {
            const doc = await loadPdfDocument(await file.arrayBuffer(), pwd);
            pdfJsDocRef.current = doc;
            setPageCount(doc.numPages);
            setTargetPage(1);
            setStatus('ready');
        } catch (e) {
            handleError(e, 'Could not read the PDF.');
        }
    }, [setStatus, handleError]);

    const onFileSelect = useCallback((file: File) => {
        handleFile(file, (f) => loadPdfThumbnails(f));
    }, [handleFile, loadPdfThumbnails]);

    const onPasswordSubmit = useCallback((pwd: string) => {
        handlePasswordSubmit(pwd, () => {
            if (fileRef.current) loadPdfThumbnails(fileRef.current, pwd);
        });
    }, [handlePasswordSubmit, loadPdfThumbnails, fileRef]);

    const renderPageThumb = useCallback(async (pageNum: number) => {
        if (!pdfJsDocRef.current) return;
        try {
            const page = await pdfJsDocRef.current.getPage(pageNum);
            const vp = page.getViewport({ scale: 1.35 });
            const canvas = await renderPdfPageToCanvas(pdfJsDocRef.current, pageNum, { scale: 1.35 });
            const url = await canvasToObjectUrl(canvas, 'image/jpeg', 0.85);
            setPageThumb((prev) => {
                revokeObjectUrl(prev);
                return url;
            });
            setPageThumbW(vp.width);
            setPageThumbH(vp.height);
            const vp1 = page.getViewport({ scale: 1 });
            setPageRealW(vp1.width);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        if (status === 'ready' || status === 'processing' || status === 'done') {
            renderPageThumb(targetPage);
        }
    }, [targetPage, renderPageThumb, status]);
    useEffect(() => () => revokeObjectUrl(pageThumb), [pageThumb]);

    const pxPerPoint = pageThumbW / pageRealW;
    const previewSigX = sigX * MM * pxPerPoint;
    const previewSigY = sigY * MM * pxPerPoint;
    const previewSigW = sigW * MM * pxPerPoint;

    // ─── Process PDF ────────────────────────────────────────────────────────
    const handleProcess = async () => {
        if (!fileRef.current) return;
        if (!sigDataUrl) {
            setErrorMsg('Please draw, type, or upload your signature first.');
            return;
        }
        setStatus('processing');
        setErrorMsg('');
        isCancelledRef.current = false;

        try {
            const { PDFDocument } = await import('pdf-lib');
            const fileBytes = new Uint8Array(await fileRef.current.arrayBuffer());
            if (isCancelledRef.current) { setStatus('ready'); return; }

            // Pass the password from usePdfTool so encrypted PDFs are handled correctly.
            // pdf-lib's TypeScript types don't expose the password option, so we spread it via any.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const loadOptions: any = {};
            if (password) {
                loadOptions.password = password;
            }
            const doc = await PDFDocument.load(fileBytes, loadOptions);

            const page = doc.getPage(targetPage - 1);
            const { height: pageH } = page.getSize();

            const base64 = sigDataUrl.split(',')[1];
            const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const img = await doc.embedPng(imgBytes);
            if (isCancelledRef.current) { setStatus('ready'); return; }

            const drawW = sigW * MM;
            const aspectRatio = img.height / img.width;
            const drawH = drawW * aspectRatio;

            page.drawImage(img, {
                x: sigX * MM,
                y: pageH - sigY * MM - drawH,
                width: drawW,
                height: drawH,
            });

            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await doc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setStatus('done');
        } catch (e) {
            handleError(e, 'Failed to sign the PDF.');
        }
    };

    const isActive = status === 'ready' || status === 'processing' || status === 'done';

    // ─── Drag-to-move handlers ────────────────────────────────────────────────
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragInfo) return;
        const threshold = 80;
        const speed = 10;
        if (e.clientY < threshold) window.scrollBy({ top: -speed, behavior: 'auto' });
        else if (e.clientY > window.innerHeight - threshold) window.scrollBy({ top: speed, behavior: 'auto' });

        const dx = (e.clientX - dragInfo.startX) / (MM * pxPerPoint);
        const dy = (e.clientY - dragInfo.startY + (window.scrollY - dragInfo.initialScrollY)) / (MM * pxPerPoint);
        setSigX(Math.max(0, Math.round(dragInfo.initialX + dx)));
        setSigY(Math.max(0, Math.round(dragInfo.initialY + dy)));
    }, [dragInfo, pxPerPoint]);

    const handleMouseUp = () => setDragInfo(null);
    useEffect(() => {
        if (dragInfo) {
            window.addEventListener('mousemove', handleMouseMove as never);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove as never);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove as never);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragInfo, handleMouseMove]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="✍️" title="Sign PDF" />
            <div className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col gap-5">
                <ToolHero
                    icon="✍️"
                    title="PDF Sign"
                    description="Add your signature or images to PDF documents interactively."
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
                    <DropZone onFile={onFileSelect} fileName={fileName} />

                    {status === 'needs_password' && (
                        <PasswordPrompt
                            onSubmit={onPasswordSubmit}
                            onCancel={() => setStatus('idle')}
                            errorMsg={errorMsg}
                        />
                    )}

                    {isActive && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left: settings */}
                            <div className="flex flex-col gap-4">
                                {/* Shared SignaturePad component */}
                                <SignaturePad onChange={setSigDataUrl} />

                                {/* Placement */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-3">Placement on page</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">X: {sigX}mm</label>
                                            <input type="range" min={0} max={180} value={sigX} onChange={(e) => setSigX(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Y from top: {sigY}mm</label>
                                            <input type="range" min={0} max={260} value={sigY} onChange={(e) => setSigY(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-gray-500 block mb-1">Width: {sigW}mm</label>
                                            <input type="range" min={10} max={180} value={sigW} onChange={(e) => setSigW(+e.target.value)} className="w-full accent-indigo-500" />
                                        </div>
                                    </div>
                                </div>

                                {/* Page selector */}
                                {pageCount > 1 && (
                                    <div>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                                            Page: <span className="text-indigo-400">{targetPage}</span> of {pageCount}
                                        </label>
                                        <input type="range" min={1} max={pageCount} value={targetPage}
                                            onChange={(e) => setTargetPage(+e.target.value)} className="w-full accent-indigo-500" />
                                    </div>
                                )}

                                {/* Actions */}
                                <ProcessingButton
                                    onClick={handleProcess}
                                    onCancel={handleCancel}
                                    isProcessing={status === 'processing'}
                                    idleLabel="✍️ Sign & Download"
                                    processingLabel="Signing…"
                                />

                                {status === 'done' && downloadUrl && (
                                    <a href={downloadUrl} download={`signed-${fileName}`}
                                        className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                        ⬇️ Download Signed PDF
                                    </a>
                                )}

                                {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                            </div>

                            {/* Right: live page preview */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Live Preview</label>
                                <div
                                    className="relative rounded-xl overflow-hidden border border-gray-700/50 bg-gray-800 flex items-center justify-center cursor-crosshair"
                                    onClick={() => setIsSelected(false)}
                                    style={{ aspectRatio: `${pageThumbW || 210} / ${pageThumbH || 297}` }}
                                >
                                    {pageThumb ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={pageThumb} alt="Page preview" className="w-full h-full object-contain" />

                                            {/* Signature overlay */}
                                            {sigDataUrl && pageThumbW > 0 && (
                                                <div className="absolute inset-0" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={sigDataUrl}
                                                        alt="Signature overlay"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setIsSelected(true);
                                                            setDragInfo({
                                                                startX: e.clientX,
                                                                startY: e.clientY,
                                                                initialX: sigX,
                                                                initialY: sigY,
                                                                initialScrollY: window.scrollY
                                                            });
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsSelected(true);
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${(previewSigX / pageThumbW) * 100}%`,
                                                            top: `${(previewSigY / pageThumbH) * 100}%`,
                                                            width: `${(previewSigW / pageThumbW) * 100}%`,
                                                            objectFit: 'contain',
                                                            pointerEvents: 'auto',
                                                            cursor: 'move',
                                                            userSelect: 'none',
                                                            border: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                                                            boxShadow: isSelected ? '0 0 0 4px rgba(99, 102, 241, 0.2)' : 'none',
                                                            borderRadius: '4px',
                                                            transition: 'border 0.2s, box-shadow 0.2s'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-gray-600 text-sm flex items-center gap-2">
                                            <span className="animate-spin">⏳</span> Loading preview…
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-600 text-center">
                                    Move the X / Y / Width sliders to position your signature
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
