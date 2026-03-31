'use client';
import React, { useRef } from 'react';

interface DropZoneProps {
    onFile: (file: File) => void;
    fileName?: string;
    accept?: string;
    multiple?: boolean;
    label?: string;
}

export default function DropZone({
    onFile,
    fileName,
    accept = 'application/pdf',
    multiple = false,
    label = 'Drop your PDF here'
}: DropZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
        }
    };

    return (
        <div
            className="relative rounded-xl border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors cursor-pointer bg-gray-800/40 hover:bg-gray-800/70 flex flex-col items-center justify-center py-8 px-6 gap-2"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            onKeyDown={handleKeyDown}
            role="button"
            aria-label={label}
            tabIndex={0}
        >
            <div className="text-4xl opacity-60">📄</div>
            {fileName ? (
                <div className="text-center">
                    <p className="text-indigo-400 font-semibold break-all text-sm">{fileName}</p>
                    <p className="text-gray-500 text-xs mt-0.5">Click or drop to replace</p>
                </div>
            ) : (
                <div className="text-center">
                    <p className="text-gray-300 font-medium">{label}</p>
                    <p className="text-gray-500 text-xs mt-0.5">or click to browse</p>
                </div>
            )}
            <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.currentTarget.value = '';
                }} />
        </div>
    );
}
