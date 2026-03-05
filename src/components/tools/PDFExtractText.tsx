'use client';

import React, { useState, useRef } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function PDFExtractText() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [text, setText] = useState('');
    const [copied, setCopied] = useState(false);
    const fileRef = useRef<File | null>(null);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('idle'); setText('');
    };

    const handleExtract = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg(''); setText('');
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
            const doc = await pdfjs.getDocument({ data: new Uint8Array(await fileRef.current.arrayBuffer()) }).promise;
            const pages: string[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                setProgress(`Extracting page ${i}/${doc.numPages}…`);
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const pageText = content.items.map((item: any) => item.str).join(' ');
                pages.push(`--- Page ${i} ---\n${pageText}`);
            }
            setText(pages.join('\n\n'));
            setProgress(''); setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Text extraction failed.'); setStatus('error'); }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName.replace('.pdf', '.txt');
        a.click();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="📝" title="Extract Text" />
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {fileName && (
                        <button onClick={handleExtract} disabled={status === 'processing'}
                            className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                            {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress}</> : '📝 Extract Text'}
                        </button>
                    )}
                    {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                </div>

                {text && (
                    <div className="bg-gray-900 rounded-2xl border border-gray-700/50 overflow-hidden flex flex-col">
                        <div className="px-5 py-3 border-b border-gray-700/50 flex items-center justify-between">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                                Extracted Text ({text.length.toLocaleString()} chars)
                            </p>
                            <div className="flex gap-2">
                                <button onClick={handleCopy}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors">
                                    {copied ? '✅ Copied!' : '📋 Copy All'}
                                </button>
                                <button onClick={handleDownload}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 transition-colors">
                                    ⬇️ .txt
                                </button>
                            </div>
                        </div>
                        <textarea
                            readOnly value={text}
                            className="flex-1 min-h-64 bg-gray-900 text-gray-300 text-xs font-mono p-4 resize-none outline-none leading-relaxed"
                        />
                    </div>
                )}
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
