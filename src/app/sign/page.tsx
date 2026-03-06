'use client';
import dynamic from 'next/dynamic';
const PDFSign = dynamic(() => import('@/components/tools/PDFSign'), { ssr: false });
export default function Page() { return <PDFSign />; }
