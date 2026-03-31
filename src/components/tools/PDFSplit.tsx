'use client';

import React, { useState, useRef, useCallback } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';
type OutputFormat = 'pdf-merged' | 'pdf-zip' | 'jpg-zip' | 'png-zip';
type SplitMode = 'select' | 'range' | 'all';

interface PageThumb { pageNum: number; url: string; selected: boolean; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsDoc = any;

const OUTPUT_FORMATS: { value: OutputFormat; label: string; icon: string; desc: string }[] = [
    { value: 'pdf-merged', icon: '📄', label: 'Single PDF', desc: 'Selected pages merged into one PDF' },
    { value: 'pdf-zip', icon: '🗂️', label: 'ZIP of PDFs', desc: 'Each page as a separate PDF in ZIP' },
    { value: 'jpg-zip', icon: '🖼️', label: 'ZIP of JPGs', desc: 'Each page as a JPG image in ZIP' },
    { value: 'png-zip', icon: '🎨', label: 'ZIP of PNGs', desc: 'Each page as a PNG image in ZIP' },
];

export default function PDFSplit() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [thumbs, setThumbs] = useState<PageThumb[]>([]);
    const [totalPages, setTotalPages] = useState(0);
    const [splitMode, setSplitMode] = useState<SplitMode>('select');
    const [rangeInput, setRangeInput] = useState('');
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('pdf-merged');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadName, setDownloadName] = useState('');
    const isCancelledRef = useRef(false);
    const fileRef = useRef<File | null>(null);
    const pdfjsDocRef = useRef<PdfjsDoc>(null);

    // ── Load page thumbnails ───────────────────────────────────────────────
    const loadThumbs = useCallback(async (file: File) => {
        setStatus('loading'); setThumbs([]); setDownloadUrl(null);
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const doc = await pdfjs.getDocument({ 
                data: new Uint8Array(await file.arrayBuffer()),
                cMapUrl: '/cmaps/',
                cMapPacked: true,
            }).promise;
            pdfjsDocRef.current = doc;
            setTotalPages(doc.numPages);
            const results: PageThumb[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const viewport = page.getViewport({ scale: 0.4 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as Parameters<typeof page.render>[0]).promise;
                results.push({ pageNum: i, url: canvas.toDataURL('image/jpeg', 0.7), selected: true });
            }
            setThumbs(results); setStatus('ready');
        } catch (e) { console.error(e); setErrorMsg('Failed to load PDF.'); setStatus('error'); }
    }, []);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); loadThumbs(file);
    };

    const togglePage = (n: number) => setThumbs(prev => prev.map(t => t.pageNum === n ? { ...t, selected: !t.selected } : t));
    const selectAll = () => setThumbs(prev => prev.map(t => ({ ...t, selected: true })));
    const selectNone = () => setThumbs(prev => prev.map(t => ({ ...t, selected: false })));

    const parseRange = (input: string, max: number): number[] => {
        const pages = new Set<number>();
        input.split(',').forEach(part => {
            const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
            if (m) {
                const start = parseInt(m[1]), end = m[2] ? parseInt(m[2]) : start;
                for (let i = Math.max(1, start); i <= Math.min(max, end); i++) pages.add(i);
            }
        });
        return [...pages].sort((a, b) => a - b);
    };

    const getSelectedPages = (): number[] => {
        if (splitMode === 'all') return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (splitMode === 'range') return parseRange(rangeInput, totalPages);
        return thumbs.filter(t => t.selected).map(t => t.pageNum);
    };

    // ── Render a page at full quality → canvas ────────────────────────────
    const renderPageCanvas = async (pageNum: number, scale = 2): Promise<HTMLCanvasElement> => {
        const doc = pdfjsDocRef.current!;
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as Parameters<typeof page.render>[0]).promise;
        return canvas;
    };

    // ── Main export handler ───────────────────────────────────────────────
    const handleExport = async () => {
        if (!fileRef.current) return;
        const selectedPages = getSelectedPages();
        if (selectedPages.length === 0) { setErrorMsg('Select at least one page.'); return; }

        setStatus('processing'); setErrorMsg(''); setDownloadUrl(null);
        isCancelledRef.current = false;
        const baseName = fileName.replace(/\.pdf$/i, '');

        try {
            // ── 1. Single merged PDF ──────────────────────────────────────────
            if (outputFormat === 'pdf-merged') {
                const { PDFDocument } = await import('pdf-lib');
                const srcBytes = await fileRef.current.arrayBuffer();
                const srcDoc = await PDFDocument.load(srcBytes);
                const newDoc = await PDFDocument.create();
                for (let idx = 0; idx < selectedPages.length; idx++) {
                    if (isCancelledRef.current) { setStatus('ready'); setProgress(''); return; }
                    setProgress(`Copying page ${idx + 1}/${selectedPages.length}…`);
                    const [copied] = await newDoc.copyPages(srcDoc, [selectedPages[idx] - 1]);
                    newDoc.addPage(copied);
                }
                if (isCancelledRef.current) { setStatus('ready'); setProgress(''); return; }
                setProgress('Saving…');
                const bytes = await newDoc.save();
                const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
                setDownloadUrl(URL.createObjectURL(blob));
                setDownloadName(`${baseName}-pages.pdf`);
                setProgress(''); setStatus('done');
                return;
            }

            // ── 2 & 3 & 4. ZIP of PDFs / JPGs / PNGs ─────────────────────────
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();

            const { PDFDocument } = outputFormat === 'pdf-zip' ? await import('pdf-lib') : { PDFDocument: null };
            const srcDoc = outputFormat === 'pdf-zip' && PDFDocument
                ? await PDFDocument.load(await fileRef.current.arrayBuffer()) : null;

            for (let idx = 0; idx < selectedPages.length; idx++) {
                if (isCancelledRef.current) { setStatus('ready'); setProgress(''); return; }
                const pageNum = selectedPages[idx];
                setProgress(`Processing page ${pageNum} (${idx + 1}/${selectedPages.length})…`);

                if (outputFormat === 'pdf-zip' && srcDoc && PDFDocument) {
                    const newDoc = await PDFDocument.create();
                    const [copied] = await newDoc.copyPages(srcDoc, [pageNum - 1]);
                    newDoc.addPage(copied);
                    zip.file(`page-${pageNum}.pdf`, await newDoc.save());
                } else {
                    // Image formats
                    const canvas = await renderPageCanvas(pageNum, 2);
                    const isJpg = outputFormat === 'jpg-zip';
                    const mimeType = isJpg ? 'image/jpeg' : 'image/png';
                    const quality = isJpg ? 0.92 : undefined;
                    const dataUrl = canvas.toDataURL(mimeType, quality);
                    const base64 = dataUrl.split(',')[1];
                    const ext = isJpg ? 'jpg' : 'png';
                    zip.file(`page-${pageNum}.${ext}`, base64, { base64: true });
                }
            }

            setProgress('Zipping…');
            if (isCancelledRef.current) { setStatus('ready'); setProgress(''); return; }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const ext = outputFormat === 'pdf-zip' ? 'pdf' : outputFormat === 'jpg-zip' ? 'jpg' : 'png';
            setDownloadUrl(URL.createObjectURL(zipBlob));
            setDownloadName(`${baseName}-pages-${ext}.zip`);
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Export failed.'); setStatus('ready'); }
    };

    const selectedCount = getSelectedPages().length;
    const selectedFmt = OUTPUT_FORMATS.find(f => f.value === outputFormat)!;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="✂️" title="PDF Split" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="✂️" 
                    title="PDF Split" 
                    description="Extract specific pages from your PDF or split every page into separate files." 
                />

                {/* Main card */}
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />

                    {status !== 'idle' && status !== 'error' && (
                        <>
                            {/* Selection Mode */}
                            <div>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Selection Mode</p>
                                <div className="flex gap-2 flex-wrap">
                                    {(['select', 'range', 'all'] as const).map(m => (
                                        <button key={m} onClick={() => setSplitMode(m)}
                                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${splitMode === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                            {m === 'select' ? '🖱 Select Pages' : m === 'range' ? '✏️ Page Range' : '📋 All Pages'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {splitMode === 'range' && (
                                <input type="text" value={rangeInput} onChange={e => setRangeInput(e.target.value)}
                                    placeholder="e.g. 1-3, 5, 7-9"
                                    className="bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500" />
                            )}
                            {splitMode === 'select' && (
                                <div className="flex gap-2 items-center">
                                    <button onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Select All</button>
                                    <span className="text-gray-600">·</span>
                                    <button onClick={selectNone} className="text-xs text-gray-400 hover:text-white transition-colors">Clear</button>
                                    <span className="ml-auto text-xs text-gray-500">{selectedCount} page{selectedCount !== 1 ? 's' : ''} selected</span>
                                </div>
                            )}

                            {/* Output Format */}
                            <div>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Output Format</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {OUTPUT_FORMATS.map(fmt => (
                                        <button key={fmt.value} onClick={() => setOutputFormat(fmt.value)}
                                            className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all border ${outputFormat === fmt.value
                                                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                                                }`}>
                                            <span className="text-lg shrink-0">{fmt.icon}</span>
                                            <div>
                                                <p className="text-sm font-medium leading-tight">{fmt.label}</p>
                                                <p className="text-xs opacity-70 mt-0.5 leading-tight">{fmt.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Export button */}
                            <ProcessingButton
                                onClick={handleExport}
                                onCancel={() => { isCancelledRef.current = true; }}
                                disabled={status === 'loading'}
                                isProcessing={status === 'processing'}
                                idleLabel={<>{selectedFmt.icon} Export {selectedCount > 0 ? `${selectedCount} page${selectedCount !== 1 ? 's' : ''}` : ''} as {selectedFmt.label}</>}
                                processingLabel={progress || 'Processing…'}
                                className="bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                            />

                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={downloadName}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download {downloadName}
                                </a>
                            )}
                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>

                {/* Page thumbnails grid */}
                {thumbs.length > 0 && splitMode === 'select' && (
                    <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-4">
                            Pages — click to toggle
                        </p>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                            {thumbs.map(t => (
                                <button key={t.pageNum} onClick={() => togglePage(t.pageNum)}
                                    className={`relative rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${t.selected ? 'border-indigo-500 shadow-md shadow-indigo-500/20' : 'border-gray-700 opacity-40'
                                        }`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={t.url} alt={`Page ${t.pageNum}`} className="w-full block" />
                                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${t.selected ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'
                                        }`}>{t.selected ? '✓' : ''}</div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[10px] text-gray-300 py-0.5">
                                        {t.pageNum}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
