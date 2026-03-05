import Link from 'next/link';

const TOOLS = [
  { href: '/invert', icon: '🔄', title: 'Invert Colors', desc: 'Invert PDF colors. Custom tint, presets, live preview.', color: 'from-indigo-600/20 to-purple-600/20 border-indigo-500/30' },
  { href: '/split', icon: '✂️', title: 'Split PDF', desc: 'Extract pages by selection or range. Download as ZIP.', color: 'from-rose-600/20 to-orange-600/20 border-rose-500/30' },
  { href: '/merge', icon: '🔗', title: 'Merge PDFs', desc: 'Combine multiple PDFs. Drag to reorder.', color: 'from-cyan-600/20 to-blue-600/20 border-cyan-500/30' },
  { href: '/compress', icon: '🗜️', title: 'Compress PDF', desc: 'Reduce file size. Low / Medium / High quality.', color: 'from-amber-600/20 to-yellow-600/20 border-amber-500/30' },
  { href: '/rotate', icon: '🔃', title: 'Rotate Pages', desc: 'Rotate all or individual pages. 90°, 180°, 270°.', color: 'from-teal-600/20 to-green-600/20 border-teal-500/30' },
  { href: '/page-numbers', icon: '🔢', title: 'Page Numbers', desc: 'Add page numbers with custom position and style.', color: 'from-violet-600/20 to-pink-600/20 border-violet-500/30' },
  { href: '/watermark', icon: '💧', title: 'Watermark', desc: 'Add text watermark with opacity, size, and position.', color: 'from-sky-600/20 to-blue-600/20 border-sky-500/30' },
  { href: '/protect', icon: '🔒', title: 'Protect PDF', desc: 'Password-lock your PDF with permission controls.', color: 'from-red-600/20 to-rose-600/20 border-red-500/30' },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">

      {/* Hero */}
      <div className="text-center py-16 px-4">
        <div className="inline-flex items-center gap-3 mb-4">
          <span className="text-4xl">📑</span>
          <h1 className="text-4xl font-extrabold tracking-tight">PDF Tools</h1>
        </div>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          All the PDF tools you need — free, fast, and 100% in your browser.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-emerald-400 text-xs font-medium">
          🔒 Nothing is uploaded — your files stay on your device
        </div>
      </div>

      {/* Tool Cards */}
      <div className="flex-1 px-4 pb-16 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map(tool => (
            <Link key={tool.href} href={tool.href}
              className={`group relative bg-gradient-to-br ${tool.color} border rounded-2xl p-6 transition-all hover:scale-[1.03] hover:shadow-xl hover:shadow-black/30 active:scale-100`}>
              <div className="text-3xl mb-3">{tool.icon}</div>
              <h2 className="text-base font-bold text-white mb-1">{tool.title}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{tool.desc}</p>
              <div className="absolute bottom-4 right-4 text-gray-600 group-hover:text-gray-400 transition-colors text-sm">→</div>
            </Link>
          ))}
        </div>
      </div>

      <footer className="text-center pb-8 text-gray-600 text-xs">
        Built with Next.js · pdf-lib · pdfjs-dist
      </footer>
    </main>
  );
}
