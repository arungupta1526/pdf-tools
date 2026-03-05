# 📑 PDF Tools Suite

A fast, modern, and **100% private** web application offering a comprehensive suite of 14 PDF manipulation tools. Built with Next.js, Tailwind CSS, `pdf-lib`, and `pdfjs-dist`.

**Security Guarantee**: All processing happens entirely within your web browser using WebAssembly. Your files are **never** uploaded to any external server.

---

## ✨ Features (14 Tools)

### � Pages & Structure
1. **✂️ Split PDF**: Extract specific pages or ranges. Download as a new PDF, a ZIP of individual PDFs, or a ZIP of extracted JPGs/PNGs.
2. **🔗 Merge PDFs**: Combine multiple PDF files into one. Features a drag-and-drop interface to easily reorder files before merging.
3. **🗑️ Remove Pages**: Visual grid showing all pages. Click pages to mark them for deletion (with a red X overlay) and download the remaining document.
4. **🔃 Rotate Pages**: Rotate all pages globally (90°, 180°, 270°) or rotate individual pages using on-page controls via a thumbnail grid.

### 🎨 Color & Visuals
5. **🔄 Invert Colors**: Convert PDF colors (black to white, white to black) with a custom color picker, dominant color extraction from the document, and a live side-by-side preview.
6. **🌑 Grayscale PDF**: Strip all colors from a PDF to create a pure black and white output, featuring live desaturation preview.
7. **🖼️ Images → PDF**: Convert and combine JPG, PNG, and WebP images into a single PDF document. Includes drag-to-reorder and page size constraints (Original, A4, Letter).

### 🛠️ Edit & Optimize
8. **🗜️ Compress PDF**: Drastically reduce your file size. Choose between standard quality presets (Low, Medium, High) or specify an exact target size in KB/MB.
9. **🔢 Page Numbers**: Automatically add sequential page numbers. Features a **live preview** panel to visualize placement, font size, and prefix text in real-time.
10. **💧 Watermark**: Overlay text diagonally, centered, or anchored. Features a **live preview** panel to instantly see changes to opacity, color, size, and text.
11. **✏️ Edit Metadata**: Read and modify hidden PDF metadata tags including Title, Author, Subject, Keywords, Creator, and Producer.

### 🔒 Security & Data
12. **🔒 Protect PDF**: Lock your PDF with a password using RC4 encryption. Includes toggleable permissions to disable printing and text copying.
13. **🔓 Unlock PDF**: Remove passwords and encryption from a locked PDF (note: requires you to know the password to unlock it).
14. **📝 Extract Text**: Scrapes and extracts all readable text from the PDF using OCR. Displays it in a scrollable view with options to copy to clipboard or download as a `.txt` file.

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

6. Open [http://localhost:3000](http://localhost:3000) with your browser.

### 🐳 Run with Docker (Recommended for Self-Hosting)

We provide a fully containerized setup using Docker. For full instructions on how to build and run the PDF Tools Suite container, please see the **[Docker Setup Guide](DOCKER.md)**.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **PDF Manipulation**: `pdf-lib`
- **PDF Rendering/Previews**: `pdfjs-dist` (Mozilla PDF.js)
- **File Archiving**: `jszip` (for returning split zipped formats)

---

## 📜 License

MIT License
