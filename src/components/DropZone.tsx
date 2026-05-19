'use client';
import React, { useRef, useState, useCallback } from 'react';

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
    const [isDragActive, setIsDragActive] = useState(false);
    const dragCounter = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragActive(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
            setIsDragActive(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    }, [onFile]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
        }
    };

    return (
        <div
            className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center py-8 px-6 gap-2
                ${isDragActive ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' : 'border-gray-600 hover:border-indigo-500 bg-gray-800/40 hover:bg-gray-800/70'}
            `}
            onDrop={handleDrop}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
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
