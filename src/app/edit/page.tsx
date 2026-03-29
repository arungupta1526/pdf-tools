'use client';
import dynamic from 'next/dynamic';
const PDFEdit = dynamic(() => import('@/components/tools/PDFEdit'), { ssr: false });
export default function Page() { return <PDFEdit />; }
