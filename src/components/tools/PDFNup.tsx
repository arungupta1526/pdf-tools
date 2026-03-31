'use client';

import React, { useState, useRef } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { canvasToBlob, isPdfFile, loadPdfDocument, mapConcurrent, renderPdfPageToCanvas, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'processing' | 'done' | 'error';

const NUP_OPTIONS = [2, 4, 6, 8, 9, 16] as const;

// mm → PDF points (1 mm = 2.835 pt)
const MM = 2.835;

// Standard page sizes in points
const PAGE_SIZES: Record<string, { w: number; h: number }> = {
    A4: { w: 595.28, h: 841.89 },
    Letter: { w: 612, h: 792 },
};

function getGrid(n: number): { cols: number; rows: number } {
    if (n === 2) return { cols: 2, rows: 1 };
    if (n === 6) return { cols: 3, rows: 2 };
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return { cols, rows };
}

export default function PDFNup() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);

    // Settings
    const [layoutMode, setLayoutMode] = useState<'preset' | 'custom'>('preset');
    const [nup, setNup] = useState<number>(4);
    const [customCols, setCustomCols] = useState(2);
    const [customRows, setCustomRows] = useState(2);
    const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
    const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
    const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'auto'>('auto');
    const [outerMargin, setOuterMargin] = useState(10); // mm
    const [innerMargin, setInnerMargin] = useState(5);   // mm
    const [showBorder, setShowBorder] = useState(true);

    // Computed effective grid
    const effectiveGrid = layoutMode === 'custom'
        ? { cols: customCols, rows: customRows }
        : getGrid(nup);
    const effectiveCols = effectiveGrid.cols;
    const effectiveRows = effectiveGrid.rows;

    const fileRef = useRef<File | null>(null);

    const handleFile = (file: File) => {
        if (!isPdfFile(file)) { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file;
        setFileName(file.name);
        setErrorMsg('');
        setStatus('idle');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    const handleProcess = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg(''); setProgress('Preparing…');
        isCancelledRef.current = false;

        try {
            const { PDFDocument, rgb } = await import('pdf-lib');

            // Load source with pdfjs for rendering
            const srcDoc = await loadPdfDocument(await fileRef.current.arrayBuffer());
            const totalPages = srcDoc.numPages;

            // Create output PDF
            const outDoc = await PDFDocument.create();

            const cols = effectiveCols;
            const rows = effectiveRows;
            const pagesPerSheet = cols * rows;

            // Determine output page dimensions
            const base = PAGE_SIZES[pageSize];
            let outW: number, outH: number;
            if (orientation === 'landscape') {
                outW = Math.max(base.w, base.h);
                outH = Math.min(base.w, base.h);
            } else if (orientation === 'portrait') {
                outW = Math.min(base.w, base.h);
                outH = Math.max(base.w, base.h);
            } else {
                // auto: landscape if cols > rows, portrait otherwise
                if (cols > rows) {
                    outW = Math.max(base.w, base.h);
                    outH = Math.min(base.w, base.h);
                } else {
                    outW = Math.min(base.w, base.h);
                    outH = Math.max(base.w, base.h);
                }
            }

            const om = outerMargin * MM; // outer margin in points
            const im = innerMargin * MM; // inner margin in points

            // Usable area
            const usableW = outW - 2 * om;
            const usableH = outH - 2 * om;

            // Cell size (including inner margin)
            const cellW = (usableW - (cols - 1) * im) / cols;
            const cellH = (usableH - (rows - 1) * im) / rows;

            const totalSheets = Math.ceil(totalPages / pagesPerSheet);

            for (let sheet = 0; sheet < totalSheets; sheet++) {
                if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
                setProgress(`Sheet ${sheet + 1}/${totalSheets}…`);
                const outPage = outDoc.addPage([outW, outH]);

                const sheetPageIndices = [];
                for (let slot = 0; slot < pagesPerSheet; slot++) {
                    const pageIdx = sheet * pagesPerSheet + slot;
                    if (pageIdx < totalPages) sheetPageIndices.push({ pageIdx, slot });
                }

                const sheetResults = await mapConcurrent(sheetPageIndices, 2, async ({ pageIdx, slot }: { pageIdx: number, slot: number }) => {
                    if (isCancelledRef.current) throw new Error('CANCELLED');
                    const srcPage = await srcDoc.getPage(pageIdx + 1);
                    const vp = srcPage.getViewport({ scale: 1 });
                    const scale = Math.min(cellW / vp.width, cellH / vp.height);
                    
                    const canvas = await renderPdfPageToCanvas(srcDoc, pageIdx + 1, { scale: scale * 2 });
                    const imgBytes = await (await canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer();
                    return { imgBytes, slot, vp, scale };
                });

                for (const res of sheetResults) {
                    const img = await outDoc.embedJpg(res.imgBytes);
                    const row = Math.floor(res.slot / cols);
                    let col = res.slot % cols;
                    if (direction === 'rtl') col = cols - 1 - col;

                    const drawW = res.vp.width * res.scale;
                    const drawH = res.vp.height * res.scale;
                    const cellX = om + col * (cellW + im);
                    const cellY = outH - om - (row + 1) * cellH - row * im;
                    const offsetX = (cellW - drawW) / 2;
                    const offsetY = (cellH - drawH) / 2;

                    outPage.drawImage(img, {
                        x: cellX + offsetX,
                        y: cellY + offsetY,
                        width: drawW,
                        height: drawH,
                    });

                    if (showBorder) {
                        outPage.drawRectangle({
                            x: cellX + offsetX,
                            y: cellY + offsetY,
                            width: drawW,
                            height: drawH,
                            borderColor: rgb(0.7, 0.7, 0.7),
                            borderWidth: 0.5,
                            opacity: 0,
                        });
                    }
                }
            }

            if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(blob);
            });
            setProgress('');
            setStatus('done');
        } catch (e) {
            console.error(e);
            setErrorMsg('Failed to create N-up PDF.');
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="📐" title="Multiple Pages Per Sheet" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="📐" 
                    title="Pages Per Sheet" 
                    description="Arrange multiple pages on a single sheet of paper (2-up, 4-up, etc.)." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {fileName && (
                        <>
                            {/* Layout Mode Toggle */}
                            <div>
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Layout Mode</label>
                                <div className="flex gap-2 mb-3">
                                    <button onClick={() => setLayoutMode('preset')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${layoutMode === 'preset' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                        📋 Preset
                                    </button>
                                    <button onClick={() => setLayoutMode('custom')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${layoutMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                        ✏️ Custom Rows × Cols
                                    </button>
                                </div>

                                {layoutMode === 'preset' ? (
                                    <>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Pages per sheet</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {NUP_OPTIONS.map(n => (
                                                <button key={n} onClick={() => setNup(n)}
                                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${nup === n ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Columns</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                                    <button key={n} onClick={() => setCustomCols(n)}
                                                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${customCols === n ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Rows</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                                    <button key={n} onClick={() => setCustomRows(n)}
                                                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${customRows === n ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="col-span-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2">
                                            Grid: {customCols} × {customRows} = <span className="text-indigo-400 font-semibold">{customCols * customRows} pages per sheet</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Reading Direction */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Reading Direction</label>
                                    <div className="flex gap-2">
                                        {[
                                            { val: 'ltr' as const, label: 'Left → Right' },
                                            { val: 'rtl' as const, label: 'Right → Left' },
                                        ].map(d => (
                                            <button key={d.val} onClick={() => setDirection(d.val)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${direction === d.val ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Page Size */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Page Size</label>
                                    <div className="flex gap-2">
                                        {(['A4', 'Letter'] as const).map(s => (
                                            <button key={s} onClick={() => setPageSize(s)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${pageSize === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Orientation */}
                            <div>
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Orientation</label>
                                <div className="flex gap-2">
                                    {[
                                        { val: 'auto' as const, label: '🔄 Auto' },
                                        { val: 'portrait' as const, label: '📄 Portrait' },
                                        { val: 'landscape' as const, label: '📃 Landscape' },
                                    ].map(o => (
                                        <button key={o.val} onClick={() => setOrientation(o.val)}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${orientation === o.val ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Outer Margin */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                                        Outer Margin: {outerMargin} mm
                                    </label>
                                    <input type="range" min={0} max={30} step={1} value={outerMargin}
                                        onChange={e => setOuterMargin(parseInt(e.target.value))}
                                        className="w-full accent-indigo-500" />
                                </div>

                                {/* Inner Margin */}
                                <div>
                                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                                        Inner Margin: {innerMargin} mm
                                    </label>
                                    <input type="range" min={0} max={20} step={1} value={innerMargin}
                                        onChange={e => setInnerMargin(parseInt(e.target.value))}
                                        className="w-full accent-indigo-500" />
                                </div>
                            </div>

                            {/* Border */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={showBorder} onChange={e => setShowBorder(e.target.checked)}
                                    className="w-5 h-5 rounded bg-gray-800 border-gray-600 text-indigo-500 accent-indigo-500" />
                                <span className="text-sm text-gray-300">Draw border around each page</span>
                            </label>

                            {/* ── Interactive Layout Preview ── */}
                            {(() => {
                                const cols = effectiveCols;
                                const rows = effectiveRows;
                                // Compute effective orientation
                                let isLandscape = orientation === 'landscape';
                                if (orientation === 'auto') isLandscape = cols > rows;

                                // Preview container dimensions (px) — aspect ratio matches real paper
                                const previewW = isLandscape ? 280 : 200;
                                const previewH = isLandscape ? 200 : 280;

                                // Scale margins for preview (map mm → preview px)
                                const maxDim = Math.max(previewW, previewH);
                                const omPx = (outerMargin / 30) * (maxDim * 0.12); // proportional
                                const imPx = (innerMargin / 20) * (maxDim * 0.04); // proportional

                                // Usable area
                                const usableW = previewW - 2 * omPx;
                                const usableH = previewH - 2 * omPx;
                                const cellW = Math.max((usableW - (cols - 1) * imPx) / cols, 4);
                                const cellH = Math.max((usableH - (rows - 1) * imPx) / rows, 4);
                                const totalCells = cols * rows;

                                return (
                                    <div className="flex flex-col items-center gap-2">
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Layout Preview</p>
                                        <div
                                            className="bg-white rounded-lg shadow-lg shadow-black/30 relative transition-all duration-300"
                                            style={{ width: previewW, height: previewH }}
                                        >
                                            {/* Outer margin indicator */}
                                            {outerMargin > 0 && (
                                                <div
                                                    className="absolute border border-dashed border-blue-400/30 rounded pointer-events-none transition-all duration-300"
                                                    style={{ top: omPx, left: omPx, right: omPx, bottom: omPx }}
                                                />
                                            )}

                                            {/* Grid cells */}
                                            {Array.from({ length: totalCells }, (_, i) => {
                                                const gridRow = Math.floor(i / cols);
                                                let gridCol = i % cols;
                                                if (direction === 'rtl') gridCol = cols - 1 - gridCol;

                                                const x = omPx + gridCol * (cellW + imPx);
                                                const y = omPx + gridRow * (cellH + imPx);

                                                return (
                                                    <div
                                                        key={i}
                                                        className="absolute flex items-center justify-center transition-all duration-300"
                                                        style={{
                                                            left: x,
                                                            top: y,
                                                            width: cellW,
                                                            height: cellH,
                                                            backgroundColor: 'rgba(79, 70, 229, 0.12)',
                                                            border: showBorder ? '1px solid rgba(79, 70, 229, 0.5)' : '1px solid transparent',
                                                            borderRadius: 2,
                                                        }}
                                                    >
                                                        <span className="text-[10px] font-bold" style={{ color: 'rgba(79, 70, 229, 0.7)' }}>{i + 1}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex gap-3 text-[9px] text-gray-500">
                                            <span>📏 Outer: {outerMargin}mm</span>
                                            <span>↔ Inner: {innerMargin}mm</span>
                                            <span>{showBorder ? '☑ Border' : '☐ No border'}</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Process Button */}
                            <ProcessingButton
                                onClick={handleProcess}
                                onCancel={() => { isCancelledRef.current = true; }}
                                isProcessing={status === 'processing'}
                                idleLabel="📐 Create N-up PDF"
                                processingLabel={progress || 'Processing…'}
                            />

                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`nup-${nup}-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download PDF
                                </a>
                            )}

                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>
                <p className="mt-5 text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
