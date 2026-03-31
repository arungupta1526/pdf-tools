'use client';

import React, { useState, useRef, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ProcessingButton from '@/components/ProcessingButton';
import ToolHeader from '@/components/ToolHeader';
import ToolHero from '@/components/ToolHero';
import { isPdfFile, revokeObjectUrl } from '@/lib/pdf-browser';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

interface Metadata { title: string; author: string; subject: string; keywords: string; creator: string; producer: string; }

function formatKeywords(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return value ?? '';
}

export default function PDFMetadata() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [meta, setMeta] = useState<Metadata>({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
    const isCancelledRef = useRef(false);
    const fileRef = useRef<File | null>(null);

    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const handleFile = async (file: File) => {
        if (!isPdfFile(file)) { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('loading');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await file.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            setMeta({
                title: doc.getTitle() ?? '',
                author: doc.getAuthor() ?? '',
                subject: doc.getSubject() ?? '',
                keywords: formatKeywords(doc.getKeywords()),
                creator: doc.getCreator() ?? '',
                producer: doc.getProducer() ?? '',
            });
            setStatus('ready');
        } catch (e) { console.error(e); setErrorMsg('Failed to read metadata.'); setStatus('error'); }
    };

    const handleSave = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        isCancelledRef.current = false;
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            if (isCancelledRef.current) { setStatus('ready'); return; }
            const doc = await PDFDocument.load(bytes);
            if (isCancelledRef.current) { setStatus('ready'); return; }
            doc.setTitle(meta.title);
            doc.setAuthor(meta.author);
            doc.setSubject(meta.subject);
            doc.setKeywords(meta.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean));
            doc.setCreator(meta.creator);
            doc.setProducer(meta.producer);
            if (isCancelledRef.current) { setStatus('ready'); return; }
            const outBytes = await doc.save();
            setDownloadUrl((prev) => {
                revokeObjectUrl(prev);
                return URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' }));
            });
            setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Failed to save metadata.'); setStatus('ready'); }
    };

    const fields: { key: keyof Metadata; label: string; placeholder: string }[] = [
        { key: 'title', label: 'Title', placeholder: 'Document title' },
        { key: 'author', label: 'Author', placeholder: 'Author name' },
        { key: 'subject', label: 'Subject', placeholder: 'Document subject' },
        { key: 'keywords', label: 'Keywords', placeholder: 'keyword1, keyword2' },
        { key: 'creator', label: 'Creator', placeholder: 'Application or tool name' },
        { key: 'producer', label: 'Producer', placeholder: 'PDF producer' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="✏️" title="Edit Metadata" />
            <div className="flex-1 p-6 max-w-xl mx-auto w-full flex flex-col gap-5">
                <ToolHero 
                    icon="✏️" 
                    title="Edit Metadata" 
                    description="Edit PDF properties like title, author, subject, and keywords." 
                />
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {status === 'loading' && (
                        <p className="text-center text-gray-400 text-sm animate-pulse">Reading metadata…</p>
                    )}
                    {(status === 'ready' || status === 'processing' || status === 'done') && (
                        <>
                            <div className="flex flex-col gap-3">
                                {fields.map(f => (
                                    <div key={f.key}>
                                        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1">{f.label}</label>
                                        <input type="text" value={meta[f.key]} onChange={e => setMeta(prev => ({ ...prev, [f.key]: e.target.value }))}
                                            placeholder={f.placeholder}
                                            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                    </div>
                                ))}
                            </div>
                            <ProcessingButton
                                onClick={handleSave}
                                onCancel={() => { isCancelledRef.current = true; }}
                                isProcessing={status === 'processing'}
                                idleLabel="✏️ Save Metadata"
                                processingLabel="Saving…"
                            />
                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`meta-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download PDF
                                </a>
                            )}
                        </>
                    )}
                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
