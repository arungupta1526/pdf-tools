import Link from "next/link";
import { Github, Linkedin } from "lucide-react";

const TOOLS = [
  // ── Original tools ──────────────────────────────────────────────────
  {
    href: "/invert",
    icon: "🔄",
    title: "Invert Colors",
    desc: "Invert PDF colors. Custom tint, presets, live preview.",
    color: "from-indigo-600/20 to-purple-600/20 border-indigo-500/30",
    tag: "Color",
  },
  {
    href: "/pages-per-sheet",
    icon: "📐",
    title: "Pages Per Sheet",
    desc: "Arrange 2, 4, 6, 8, 9, or 16 pages on a single sheet.",
    color: "from-pink-600/20 to-rose-600/20 border-pink-500/30",
    tag: "Pages",
  },
  {
    href: "/merge",
    icon: "🔗",
    title: "Merge PDFs",
    desc: "Combine multiple PDFs. Drag to reorder.",
    color: "from-cyan-600/20 to-blue-600/20 border-cyan-500/30",
    tag: "Pages",
  },
  {
    href: "/split",
    icon: "✂️",
    title: "Split PDF",
    desc: "Extract pages as PDF, JPG, or PNG (single or ZIP).",
    color: "from-rose-600/20 to-orange-600/20 border-rose-500/30",
    tag: "Pages",
  },
  {
    href: "/compress",
    icon: "🗜️",
    title: "Compress PDF",
    desc: "Reduce file size by quality preset or target KB/MB.",
    color: "from-amber-600/20 to-yellow-600/20 border-amber-500/30",
    tag: "Optimize",
  },
  {
    href: "/rotate",
    icon: "🔃",
    title: "Rotate Pages",
    desc: "Rotate all or individual pages. 90°, 180°, 270°.",
    color: "from-teal-600/20 to-green-600/20 border-teal-500/30",
    tag: "Pages",
  },
  {
    href: "/remove-pages",
    icon: "🗑️",
    title: "Remove Pages",
    desc: "Click pages to mark for deletion. Download the rest.",
    color: "from-orange-600/20 to-red-600/20 border-orange-500/30",
    tag: "Pages",
  },
  {
    href: "/page-numbers",
    icon: "🔢",
    title: "Page Numbers",
    desc: "Add page numbers with custom position and style.",
    color: "from-violet-600/20 to-pink-600/20 border-violet-500/30",
    tag: "Edit",
  },
  {
    href: "/watermark",
    icon: "💧",
    title: "Watermark",
    desc: "Add text watermark with opacity, size, and position.",
    color: "from-sky-600/20 to-blue-600/20 border-sky-500/30",
    tag: "Edit",
  },
  {
    href: "/reorder",
    icon: "🔀",
    title: "Reorder Pages",
    desc: "Drag-and-drop to rearrange pages. Thumbnail preview.",
    color: "from-purple-600/20 to-violet-600/20 border-purple-500/30",
    tag: "Pages",
  },
  {
    href: "/sign",
    icon: "✍️",
    title: "Sign PDF",
    desc: "Draw or type a signature and place it on any page.",
    color: "from-orange-600/20 to-amber-600/20 border-orange-500/30",
    tag: "Edit",
  },
  {
    href: "/edit",
    icon: "🎨",
    title: "Edit PDF",
    desc: "Add multiple signature/image layers. Move, resize, and delete.",
    color: "from-blue-600/20 to-cyan-600/20 border-blue-500/30",
    tag: "Creative",
  },
  {
    href: "/img-to-pdf",
    icon: "🖼️",
    title: "Images → PDF",
    desc: "Convert JPG/PNG/WebP images into a PDF. Drag to reorder.",
    color: "from-fuchsia-600/20 to-pink-600/20 border-fuchsia-500/30",
    tag: "Convert",
  },
  {
    href: "/protect",
    icon: "🔒",
    title: "Protect PDF",
    desc: "Password-lock with permission controls.",
    color: "from-red-600/20 to-rose-600/20 border-red-500/30",
    tag: "Security",
  },
  {
    href: "/unlock",
    icon: "🔓",
    title: "Unlock PDF",
    desc: "Remove password protection (requires knowing the password).",
    color: "from-lime-600/20 to-emerald-600/20 border-lime-500/30",
    tag: "Security",
  },
  // ── New tools ───────────────────────────────────────────────────────
  {
    href: "/grayscale",
    icon: "🌑",
    title: "Grayscale PDF",
    desc: "Convert color PDF to black & white. Live preview.",
    color: "from-gray-600/20 to-slate-600/20 border-gray-500/30",
    tag: "Color",
  },
  {
    href: "/extract-text",
    icon: "📝",
    title: "Extract Text",
    desc: "Copy all text from a PDF. Download as .txt.",
    color: "from-blue-600/20 to-indigo-600/20 border-blue-500/30",
    tag: "Extract",
  },
  {
    href: "/metadata",
    icon: "✏️",
    title: "Edit Metadata",
    desc: "Edit title, author, subject, keywords, creator.",
    color: "from-emerald-600/20 to-teal-600/20 border-emerald-500/30",
    tag: "Edit",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
      {/* Hero */}
      <div className="text-center py-14 px-4">
        <div className="inline-flex items-center gap-3 mb-3">
          <span className="text-4xl">📑</span>
          <h1 className="text-4xl font-extrabold tracking-tight">PDF Tools</h1>
        </div>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          {TOOLS.length} free tools — all in your browser, nothing uploaded.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-emerald-400 text-xs font-medium">
          🔒 100% local — your files never leave your device
        </div>
      </div>

      {/* Tool Grid */}
      <div className="flex-1 px-4 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`group relative bg-gradient-to-br ${tool.color} border rounded-2xl p-5 transition-all hover:scale-[1.03] hover:shadow-xl hover:shadow-black/30 active:scale-100`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{tool.icon}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                  {tool.tag}
                </span>
              </div>
              <h2 className="text-sm font-bold text-white mb-1">
                {tool.title}
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                {tool.desc}
              </p>
              <div className="absolute bottom-4 right-4 text-gray-600 group-hover:text-gray-400 transition-colors text-sm">
                →
              </div>
            </Link>
          ))}
        </div>
      </div>

      <footer className="border-t border-gray-800 py-8 px-4 text-gray-500 text-xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📑</span>
            <span className="font-semibold text-gray-400">PDF Tools</span>
            <span className="text-gray-700">·</span>
            <span>
              Made with ❤️ by{" "}
              <span className="text-gray-400 font-medium">Arun Gupta</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/arungupta1526/pdf-tools/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4" />
              <span>arungupta1526</span>
            </a>
            <span className="text-border">|</span>
            <a
              href="https://www.linkedin.com/in/arungupta1526/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Linkedin className="h-4 w-4" />
              <span>Contact</span>
            </a>
            <span className="text-gray-700">·</span>
            <span>Built with Next.js · pdf-lib · pdfjs-dist</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
