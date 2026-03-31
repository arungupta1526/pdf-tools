'use client';

import React from 'react';

interface ProcessingButtonProps {
    id?: string;
    onClick: () => void;
    onCancel: () => void;
    idleLabel: React.ReactNode;
    processingLabel: React.ReactNode;
    disabled?: boolean;
    isProcessing: boolean;
    className?: string;
}

export default function ProcessingButton({
    id,
    onClick,
    onCancel,
    idleLabel,
    processingLabel,
    disabled = false,
    isProcessing,
    className = 'bg-indigo-600 hover:bg-indigo-500',
}: ProcessingButtonProps) {
    return (
        <div className="relative">
            <button
                id={id}
                type="button"
                onClick={onClick}
                disabled={disabled || isProcessing}
                className={`w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all ${className}`}
            >
                {isProcessing ? (
                    <>
                        <span className="animate-spin">⏳</span>
                        {processingLabel}
                    </>
                ) : idleLabel}
            </button>

            {isProcessing && (
                <button
                    type="button"
                    onClick={onCancel}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/30 text-white transition-colors hover:bg-red-500"
                    aria-label="Cancel processing"
                    title="Cancel processing"
                >
                    ✕
                </button>
            )}
        </div>
    );
}
