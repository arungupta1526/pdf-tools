'use client';

import React, { useState, useRef } from 'react';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';
type PageSize = 'original' | 'a4' | 'letter';

interface ImgItem { id: string; file: File; url: string; name: string; }

const PAGE_SIZES: { value: PageSize; label: string; w: number; h: number }[] = [
    { value: 'original', label: 'Original Size', w: 0, h: 0 },
    { value: 'a4', label: 'A4 (595×842)', w: 595, h: 842 },
    { value: 'letter', label: 'Letter (612×792)', w: 612, h: 792 },
];

export default function ImgToPDF() {
    const [items, setItems] = useState<ImgItem[]>([]);
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [pageSize, setPageSize] = useState<PageSize>('a4');
    const inputRef = useRef<HTMLInputElement>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

    const addFiles = (files: FileList | File[]) => {
        const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!imgs.length) { setErrorMsg('Please upload image files (JPG, PNG, WebP).'); return; }
        setErrorMsg(''); setDownloadUrl(null); setStatus('idle');
        Promise.all(imgs.map(f => new Promise<ImgItem>(res => {
            const reader = new FileReader();
            reader.onload = e => res({ id: crypto.randomUUID(), file: f, url: e.target!.result as string, name: f.name });
            reader.readAsDataURL(f);
        }))).then(newItems => setItems(prev => [...prev, ...newItems]));
    };

    const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
    const handleDragStart = (idx: number) => { dragItem.current = idx; };
    const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
    const handleDragEnd = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const updated = [...items];
        const dragged = updated.splice(dragItem.current, 1)[0];
        updated.splice(dragOverItem.current, 0, dragged);
        setItems(updated); dragItem.current = null; dragOverItem.current = null;
    };

    const handleConvert = async () => {
        if (!items.length) return;
        setStatus('processing'); setErrorMsg('');
        try {
            const { PDFDocument } = await import('pdf-lib');
            const doc = await PDFDocument.create();
            const sizeOpt = PAGE_SIZES.find(s => s.value === pageSize)!;

            for (let i = 0; i < items.length; i++) {
                setProgress(`Embedding image ${i + 1}/${items.length}…`);
                const item = items[i];
                const bytes = await item.file.arrayBuffer();
                const isJpg = item.file.type === 'image/jpeg';
                const isPng = item.file.type === 'image/png';

                let img;
                if (isJpg) img = await doc.embedJpg(bytes);
                else if (isPng) img = await doc.embedPng(bytes);
                else {
                    // WebP/GIF: convert via canvas → JPEG
                    const canvas = document.createElement('canvas');
                    const image = new Image();
                    await new Promise(r => { image.onload = r; image.src = item.url; });
                    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                    canvas.getContext('2d')!.drawImage(image, 0, 0);
                    const jpegBytes = await fetch(canvas.toDataURL('image/jpeg', 0.92)).then(r => r.arrayBuffer());
                    img = await doc.embedJpg(jpegBytes);
                }

                const dims = img.scale(1);
                let w = dims.width, h = dims.height;
                if (pageSize !== 'original') {
                    // Fit image inside page dimensions while preserving aspect ratio
                    const pw = sizeOpt.w, ph = sizeOpt.h;
                    const scale = Math.min(pw / w, ph / h);
                    w = w * scale; h = h * scale;
                }

                const page = doc.addPage(pageSize !== 'original' ? [sizeOpt.w, sizeOpt.h] : [w, h]);
                const { width: pw, height: ph } = page.getSize();
                page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
            }

            setProgress('Saving…');
            const bytes = await doc.save();
            setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Conversion failed.'); setStatus('error'); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🖼️" title="Images → PDF" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">

                    {/* Drop zone */}
                    <div
                        className="rounded-xl border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors cursor-pointer bg-gray-800/40 hover:bg-gray-800/70 flex flex-col items-center justify-center py-8 px-6 gap-2"
                        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => inputRef.current?.click()}
                    >
                        <div className="text-4xl opacity-60">🖼️</div>
                        <p className="text-gray-300 font-medium">Drop images here</p>
                        <p className="text-gray-500 text-xs">JPG, PNG, WebP — click to browse</p>
                        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
                            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                    </div>

                    {/* Image list with drag reorder */}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Order (drag to reorder):</p>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                {items.map((item, idx) => (
                                    <div key={item.id} draggable
                                        onDragStart={() => handleDragStart(idx)}
                                        onDragEnter={() => handleDragEnter(idx)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={e => e.preventDefault()}
                                        className="relative rounded-lg overflow-hidden border border-gray-700 cursor-grab active:cursor-grabbing hover:border-gray-500 transition-colors group aspect-[3/4]"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                                        <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[10px] font-bold rounded px-1">{idx + 1}</div>
                                        <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                                            className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-500 text-white rounded w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Page size */}
                    {items.length > 0 && (
                        <div>
                            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">Page Size</label>
                            <div className="flex gap-2 flex-wrap">
                                {PAGE_SIZES.map(s => (
                                    <button key={s.value} onClick={() => setPageSize(s.value)}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${pageSize === s.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {items.length > 0 && (
                        <button onClick={handleConvert} disabled={status === 'processing'}
                            className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                            {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress}</> : `🖼️ Convert ${items.length} Image${items.length !== 1 ? 's' : ''} to PDF`}
                        </button>
                    )}

                    {status === 'done' && downloadUrl && (
                        <a href={downloadUrl} download="images.pdf"
                            className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                            ⬇️ Download PDF
                        </a>
                    )}
                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
