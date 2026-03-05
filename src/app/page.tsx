'use client';

import dynamic from 'next/dynamic';

const PDFInverter = dynamic(() => import('@/components/PDFInverter'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 flex items-center justify-center text-white text-sm opacity-50">
      Loading…
    </div>
  ),
});

export default function Home() {
  return <PDFInverter />;
}
