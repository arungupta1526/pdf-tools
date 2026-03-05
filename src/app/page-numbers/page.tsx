'use client';
import dynamic from 'next/dynamic';
const PDFPageNumbers = dynamic(() => import('@/components/tools/PDFPageNumbers'), { ssr: false, loading: () => <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white/30 text-sm">Loading…</div> });
export default function Page() { return <PDFPageNumbers />; }
