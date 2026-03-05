'use client';
import Link from 'next/link';

interface ToolHeaderProps {
    icon: string;
    title: string;
}

export default function ToolHeader({ icon, title }: ToolHeaderProps) {
    return (
        <header className="sticky top-0 z-20 bg-gray-950/80 backdrop-blur border-b border-gray-800">
            <div className="max-w-3xl mx-auto flex items-center gap-4 px-4 py-3">
                <Link href="/"
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                    <span>←</span>
                    <span>All Tools</span>
                </Link>
                <div className="h-5 w-px bg-gray-700" />
                <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-sm font-semibold text-white">{title}</span>
                </div>
            </div>
        </header>
    );
}
