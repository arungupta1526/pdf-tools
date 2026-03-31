'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { isPdfFile, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface PDFItem { id: string; file: File; name: string; }

export default function PDFMerge() {
    const [items, setItems] = useState<PDFItem[]>([]);
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const isCancelledRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const addFiles = (files: FileList | File[]) => {
        const pdfs = Array.from(files).filter(isPdfFile);
        if (pdfs.length === 0) { setErrorMsg('Please upload PDF files.'); return; }
        setItems(prev => [...prev, ...pdfs.map(f => ({ id: crypto.randomUUID(), file: f, name: f.name }))]);
        setErrorMsg(''); setStatus('idle');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
        setStatus('idle');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
    };

    // Drag-to-reorder
    const handleDragStart = (idx: number) => { dragItem.current = idx; };
    const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            const updated = [...items];
            const dragged = updated.splice(dragItem.current, 1)[0];
            updated.splice(dragOverItem.current, 0, dragged);
            setItems(updated);
            setStatus('idle');
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return null;
            });
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleMerge = useCallback(async () => {
        if (items.length < 2) { setErrorMsg('Add at least 2 PDFs.'); return; }
        setStatus('processing'); setErrorMsg(''); setProgress('Loading…');
        isCancelledRef.current = false;
        try {
            const { PDFDocument } = await import('pdf-lib');
            const outDoc = await PDFDocument.create();
            for (let i = 0; i < items.length; i++) {
                if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
                setProgress(`Merging ${i + 1}/${items.length}: ${items[i].name}`);
                const bytes = await items[i].file.arrayBuffer();
                const doc = await PDFDocument.load(bytes);
                const pages = await outDoc.copyPages(doc, doc.getPageIndices());
                pages.forEach(p => outDoc.addPage(p));
            }
            setProgress('Saving…');
            if (isCancelledRef.current) { setStatus('idle'); setProgress(''); return; }
            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(blob);
            });
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Merge failed.'); setStatus('error'); }
    }, [items]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔗" title="PDF Merge" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="🔗" 
                    title="PDF Merge" 
                    description="Combine multiple PDF files into one document in the order you want." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">

                    {/* Multi-file drop zone */}
                    <div
                        className="rounded-xl border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors cursor-pointer bg-gray-800/40 hover:bg-gray-800/70 flex flex-col items-center justify-center py-8 px-6 gap-2"
                        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => inputRef.current?.click()}
                    >
                        <div className="text-4xl opacity-60">📄</div>
                        <p className="text-gray-300 font-medium">Drop PDFs here</p>
                        <p className="text-gray-500 text-xs">or click to browse — add as many as you need</p>
                        <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
                            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                    </div>

                    {/* File list with drag reorder */}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Order (drag to reorder):</p>
                            {items.map((item, idx) => (
                                <div key={item.id}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragEnter={() => handleDragEnter(idx)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing border border-gray-700 hover:border-gray-500 transition-colors"
                                >
                                    <span className="text-gray-500 select-none text-lg">⠿</span>
                                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                                    <span className="flex-1 text-sm text-gray-200 truncate">{item.name}</span>
                                    <span className="text-xs text-gray-500">{(item.file.size / 1024).toFixed(0)} KB</span>
                                    <button onClick={() => removeItem(item.id)} className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <ProcessingButton
                        onClick={handleMerge}
                        onCancel={() => { isCancelledRef.current = true; }}
                        disabled={items.length < 2}
                        isProcessing={status === 'processing'}
                        idleLabel={`🔗 Merge ${items.length} PDFs`}
                        processingLabel={progress || 'Processing…'}
                    />

                    {status === 'done' && downloadUrl && (
                        <a href={downloadUrl} download="merged.pdf"
                            className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                            ⬇️ Download Merged PDF
                        </a>
                    )}
                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
