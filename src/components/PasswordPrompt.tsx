import React, { useState } from 'react';

interface PasswordPromptProps {
    onSubmit: (password: string) => void;
    errorMsg?: string;
    onCancel: () => void;
}

export default function PasswordPrompt({ onSubmit, errorMsg, onCancel }: PasswordPromptProps) {
    const [pwd, setPwd] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pwd) onSubmit(pwd);
    };

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-amber-400">
                <span className="text-2xl">🔒</span>
                <div>
                    <h3 className="font-semibold text-white">Password Protected</h3>
                    <p className="text-xs text-amber-400/80">This PDF is encrypted. Please enter the password to continue.</p>
                </div>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="Enter document password..."
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    autoFocus
                />
                
                {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
                
                <div className="flex gap-2">
                    <button type="button" onClick={onCancel}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition-colors text-white">
                        Cancel
                    </button>
                    <button type="submit" disabled={!pwd}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white">
                        Unlock & Continue
                    </button>
                </div>
            </form>
        </div>
    );
}
