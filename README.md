# PDF Tools Suite

A privacy-first PDF toolkit built with Next.js. The app currently includes 18 browser-based tools for splitting, merging, editing, annotating, converting, and securing PDFs without uploading files to a server.

Live demo: [arungupta1526.github.io/pdf-tools](https://arungupta1526.github.io/pdf-tools/)

## Highlights

- 100% local processing in the browser
- 18 PDF tools in one app
- Live previews for visual tools like invert, grayscale, watermark, page numbers, and signatures
- Progress feedback for heavier operations
- Cancel controls during long-running processing flows
- Static Next.js app with Docker support for self-hosting

## Tool List

### Pages and structure

1. `Split PDF` - Extract selected pages or ranges and export as a merged PDF or ZIP.
2. `Merge PDFs` - Combine multiple PDFs and reorder inputs before merging.
3. `Remove Pages` - Select pages visually and export the remaining document.
4. `Rotate Pages` - Rotate all pages globally or adjust individual pages.
5. `Pages Per Sheet` - Create N-up layouts with presets or custom rows and columns.
6. `Reorder Pages` - Drag and drop page thumbnails into a new order.

### Color and conversion

7. `Invert Colors` - Invert PDF pages with presets, custom tinting, and preview.
8. `Grayscale PDF` - Convert a PDF to black and white with preview.
9. `Images to PDF` - Turn JPG, PNG, and WebP images into a PDF and reorder them first.

### Editing and annotation

10. `Compress PDF` - Reduce file size with presets or a target size.
11. `Page Numbers` - Add page numbers with adjustable style and placement.
12. `Watermark` - Add configurable text watermarks.
13. `Sign PDF` - Draw or type a signature and place it on a page.
14. `Edit PDF` - Add, move, resize, and remove signature or image layers.
15. `Edit Metadata` - Update title, author, subject, keywords, creator, and producer fields.

### Security and extraction

16. `Protect PDF` - Apply password protection and permission controls.
17. `Unlock PDF` - Remove password protection when the password is known.
18. `Extract Text` - Read text from a PDF, copy it, or download it as `.txt`.

## Privacy

All PDF processing happens client-side in the browser using JavaScript libraries such as `pdf-lib`, `pdfjs-dist`, and `jszip`. Files are not uploaded to a backend for processing.

For longer tasks, the UI shows progress and supports cancellation. Cancellation is cooperative, so work stops at the next processing checkpoint rather than in the middle of a synchronous render step.

## Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `pdf-lib`
- `pdfjs-dist`
- `jszip`
- `lucide-react`

## Getting Started

### Local development

1. Clone the repository:

```bash
git clone https://github.com/arungupta1526/pdf-tools.git
cd pdf-tools
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open `http://localhost:3000`

### Production build

```bash
npm run build
npm run start
```

This project uses `output: "export"`, so `npm run start` serves the generated `out/` folder with a small static Node server.

### Lint

```bash
npm run lint
```

## Docker

Docker support is included for local deployment and self-hosting.

See [DOCKER.md](./DOCKER.md) for the full guide.

Quick start:

```bash
docker build -t pdf-tools .
docker run -p 3000:3000 pdf-tools
```

## Project Notes

- The app is built with the Next.js App Router.
- Each tool lives under its own route in `src/app`.
- The landing page automatically reflects the current number of tools from the in-app tool list.

## Contact

- GitHub: [github.com/arungupta1526](https://github.com/arungupta1526)
- LinkedIn: [linkedin.com/in/arungupta1526](https://linkedin.com/in/arungupta1526)

## License

MIT
