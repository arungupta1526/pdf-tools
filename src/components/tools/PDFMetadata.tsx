'use client';

import React, { useState, useRef, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

interface Metadata { title: string; author: string; subject: string; keywords: string; creator: string; producer: string; }

export default function PDFMetadata() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [meta, setMeta] = useState<Metadata>({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
    const fileRef = useRef<File | null>(null);

    const handleFile = async (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('loading'); setDownloadUrl(null);
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await file.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            setMeta({
                title: doc.getTitle() ?? '',
                author: doc.getAuthor() ?? '',
                subject: doc.getSubject() ?? '',
                keywords: doc.getKeywords() ?? '',
                creator: doc.getCreator() ?? '',
                producer: doc.getProducer() ?? '',
            });
            setStatus('ready');
        } catch (e) { console.error(e); setErrorMsg('Failed to read metadata.'); setStatus('error'); }
    };

    const handleSave = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            doc.setTitle(meta.title);
            doc.setAuthor(meta.author);
            doc.setSubject(meta.subject);
            doc.setKeywords([meta.keywords]);
            doc.setCreator(meta.creator);
            doc.setProducer(meta.producer);
            const outBytes = await doc.save();
            setDownloadUrl(URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' })));
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
                            <button onClick={handleSave} disabled={status === 'processing'}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                {status === 'processing' ? <><span className="animate-spin">⏳</span>Saving…</> : '✏️ Save Metadata'}
                            </button>
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
