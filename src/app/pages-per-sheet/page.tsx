'use client';
import dynamic from 'next/dynamic';
const PDFNup = dynamic(() => import('@/components/tools/PDFNup'), { ssr: false });
export default function Page() { return <PDFNup />; }
