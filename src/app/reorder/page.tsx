'use client';
import dynamic from 'next/dynamic';
const PDFReorder = dynamic(() => import('@/components/tools/PDFReorder'), { ssr: false });
export default function Page() { return <PDFReorder />; }
