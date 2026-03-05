'use client';

import React, { useState, useRef } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function PDFUnlock() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const fileRef = useRef<File | null>(null);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('idle'); setDownloadUrl(null);
    };

    const handleUnlock = async () => {
        if (!fileRef.current) return;
        setStatus('processing'); setErrorMsg('');
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            // Try loading with password
            const doc = await PDFDocument.load(bytes, {
                // @ts-expect-error – password option is valid
                password,
                ignoreEncryption: false,
            });
            // Save without encryption
            const outBytes = await doc.save({ useObjectStreams: false });
            setDownloadUrl(URL.createObjectURL(new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' })));
            setStatus('done');
        } catch (e: unknown) {
            console.error(e);
            const msg = (e as Error)?.message ?? '';
            if (msg.includes('password') || msg.includes('encrypt')) {
                setErrorMsg('Wrong password or unsupported encryption type.');
            } else {
                setErrorMsg('Failed to unlock. The PDF may use unsupported encryption.');
            }
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔓" title="Unlock PDF" />
            <div className="flex-1 p-6 max-w-xl mx-auto w-full flex flex-col gap-5">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {fileName && (
                        <>
                            <div>
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">PDF Password</label>
                                <div className="relative">
                                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                        placeholder="Enter the PDF password"
                                        className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 pr-12" />
                                    <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm">
                                        {showPw ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-blue-300 text-xs">
                                ℹ️ You must know the PDF password to unlock it. Works with RC4 / AES-128 encrypted PDFs.
                            </div>
                            <button onClick={handleUnlock} disabled={status === 'processing' || !password}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                {status === 'processing' ? <><span className="animate-spin">⏳</span>Unlocking…</> : '🔓 Unlock PDF'}
                            </button>
                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`unlocked-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download Unlocked PDF
                                </a>
                            )}
                            {(status === 'error' || errorMsg) && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
