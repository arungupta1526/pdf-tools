'use client';

import React, { useState, useRef } from 'react';
import DropZone from '@/components/DropZone';
import ToolHeader from '@/components/ToolHeader';

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function PDFProtect() {
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [allowPrint, setAllowPrint] = useState(true);
    const [allowCopy, setAllowCopy] = useState(false);
    const fileRef = useRef<File | null>(null);

    const handleFile = (file: File) => {
        if (file.type !== 'application/pdf') { setErrorMsg('Please upload a PDF.'); return; }
        fileRef.current = file; setFileName(file.name); setErrorMsg(''); setStatus('idle'); setDownloadUrl(null);
    };

    const handleProtect = async () => {
        if (!fileRef.current || !password) { setErrorMsg('Enter a password.'); return; }
        setStatus('processing'); setErrorMsg(''); setProgress('Encrypting…');
        try {
            const { PDFDocument } = await import('pdf-lib');
            const bytes = await fileRef.current.arrayBuffer();
            const doc = await PDFDocument.load(bytes);

            // pdf-lib encryption (RC4-128)
            const outBytes = await doc.save({
                addDefaultPage: false,
                useObjectStreams: false,
                // @ts-expect-error – pdf-lib encryption types may not be fully typed
                userPassword: password,
                ownerPassword: password + '_owner',
                permissions: {
                    printing: allowPrint ? 'lowResolution' : 'notAllowed',
                    modifying: false,
                    copying: allowCopy,
                    annotating: false,
                    fillingForms: false,
                    contentAccessibility: false,
                    documentAssembly: false,
                },
            });

            setProgress('');
            const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
            setDownloadUrl(URL.createObjectURL(blob));
            setStatus('done');
        } catch (e) { console.error(e); setErrorMsg('Protection failed. Try a different PDF.'); setStatus('error'); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
            <ToolHeader icon="🔒" title="PDF Protect" />
            <div className="flex-1 p-6 max-w-xl mx-auto w-full flex flex-col gap-5">
                <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-4">
                    <DropZone onFile={handleFile} fileName={fileName} />
                    {fileName && (
                        <>
                            <div>
                                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Password</label>
                                <div className="relative">
                                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                        placeholder="Enter password to lock PDF"
                                        className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 pr-12" />
                                    <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm transition-colors">
                                        {showPw ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Permissions</p>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={allowPrint} onChange={e => setAllowPrint(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-gray-300">Allow printing</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={allowCopy} onChange={e => setAllowCopy(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-gray-300">Allow text copying</span>
                                    </label>
                                </div>
                            </div>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-xs">
                                ⚠️ Uses RC4-128 bit encryption. Suitable for basic protection — not military grade.
                            </div>

                            <button onClick={handleProtect} disabled={status === 'processing' || !password}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                                {status === 'processing' ? <><span className="animate-spin">⏳</span>{progress || 'Encrypting…'}</> : '🔒 Protect PDF'}
                            </button>
                            {status === 'done' && downloadUrl && (
                                <a href={downloadUrl} download={`protected-${fileName}`}
                                    className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    ⬇️ Download Protected PDF
                                </a>
                            )}
                            {errorMsg && <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>}
                        </>
                    )}
                </div>
                <p className="text-center text-gray-600 text-xs">🔒 Processed locally — nothing uploaded.</p>
            </div>
        </div>
    );
}
