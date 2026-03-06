# 📑 PDF Tools Suite

A fast, modern, and **100% private** web application offering a comprehensive suite of **17 PDF manipulation tools**. Built with Next.js, Tailwind CSS, `pdf-lib`, and `pdfjs-dist`.

**Security Guarantee**: All processing happens entirely within your web browser. Your files are **never** uploaded to any external server.

🌐 **Live Demo**: [arungupta1526.github.io/pdf-tools](https://arungupta1526.github.io/pdf-tools/)

---

## ✨ Features (17 Tools)

### 📄 Pages & Structure
1. **✂️ Split PDF**: Extract specific pages or ranges. Download as a new PDF, a ZIP of individual PDFs, or a ZIP of extracted JPGs/PNGs.
2. **🔗 Merge PDFs**: Combine multiple PDF files into one. Drag-and-drop to reorder files before merging.
3. **🗑️ Remove Pages**: Visual grid of all pages. Click to mark pages for deletion, then download the cleaned document.
4. **🔃 Rotate Pages**: Rotate all pages globally (90°, 180°, 270°) or rotate individual pages using per-thumbnail controls.
5. **📐 Pages Per Sheet** (N-up): Arrange 2, 4, 6, 8, 9, or 16 pages on a single output sheet. Supports custom rows × columns, configurable margins, borders, page size, orientation, and reading direction, with a **live layout preview**.
6. **🔀 Reorder Pages**: Drag-and-drop page thumbnails to rearrange order. Includes ↑/↓ arrow buttons and a reset option.

### 🎨 Color & Visuals
7. **🔄 Invert Colors**: Invert PDF colors with a custom color picker, color presets (sepia, night-mode, etc.), and a **live side-by-side preview**.
8. **🌑 Grayscale PDF**: Convert a full-color PDF to black & white with a **live preview**.
9. **🖼️ Images → PDF**: Convert JPG, PNG, and WebP images into a single PDF. Drag to reorder, choose page size (Original, A4, Letter).

### 🛠️ Edit & Optimize
10. **🗜️ Compress PDF**: Reduce file size by quality preset (Low/Medium/High) or set an exact target size in KB or MB.
11. **🔢 Page Numbers**: Add page numbers with custom position, font size, and prefix. **Live preview** panel.
12. **💧 Watermark**: Overlay diagonal, centered, or anchored text watermarks. **Live preview** panel for opacity, color, size, and text.
13. **✍️ Sign PDF**: Add your signature by drawing on a canvas or typing in Script/Serif/Mono fonts. Full **live preview** overlay on the actual PDF page, with position and size controls.
14. **✏️ Edit Metadata**: Read and modify hidden PDF metadata — Title, Author, Subject, Keywords, Creator, Producer.

### 🔒 Security & Data
15. **🔒 Protect PDF**: Lock your PDF with a password using RC4 encryption. Toggle permissions to disable printing and copying.
16. **🔓 Unlock PDF**: Remove passwords and encryption (requires knowing the current password).
17. **📝 Extract Text**: Extract all readable text from a PDF. View in-browser, copy to clipboard, or download as a `.txt` file.

---

## 🚀 Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/arungupta1526/pdf-tools.git
   cd pdf-tools
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

5. **Run the production server**:
   ```bash
   npm run start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### 🐳 Run with Docker (Recommended for Self-Hosting)

A fully containerized setup is available. See the **[Docker Setup Guide](DOCKER.md)** for full build and run instructions.

---

## 🛠️ Tech Stack

| Layer                    | Library                       |
| ------------------------ | ----------------------------- |
| Framework                | Next.js 16 (App Router)       |
| Styling                  | Tailwind CSS                  |
| PDF Manipulation         | `pdf-lib`                     |
| PDF Rendering & Previews | `pdfjs-dist` (Mozilla PDF.js) |
| File Archiving           | `jszip`                       |

---

## 📬 Contact

- **GitHub**: [github.com/arungupta1526](https://github.com/arungupta1526)
- **Email**: arungupta1526@gmail.com

---

## 📜 License

MIT License
