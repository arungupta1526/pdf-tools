# Comprehensive Codebase Analysis Report

This report summarizes the findings from a full audit of the `pdf-tools` repository.

## 🔴 Critical Issues & Potential Bugs

### 1. Hardcoded Scaling in Processing Loops

Many tools (Inverter, Grayscale, Compress, N-up) use hardcoded scales (e.g., `1.35`, `1.6`) when rendering to canvas and then divide by the same number when embedding back into `pdf-lib`.

- **Problem**: This assumes the original PDF's "point" size is exactly `canvas.width / scale`. If a PDF has a non-standard viewport or rotation, this can lead to distorted or incorrectly sized output.
- **Locations**: `PDFInverter.tsx:318`, `PDFGrayscale.tsx:102`, `PDFCompress.tsx:68`, `PDFNup.tsx:168`.

### 2. Memory Leaks in Page Caching

`PDFInverter.tsx` uses a `pageCache` (line 99) that stores `ImageData` for every page visited.

- **Problem**: For large documents (e.g., 500+ pages), this will quickly consume several gigabytes of RAM, leading to browser crashes (OOM).
- **Fix**: Implement a Last-Recently-Used (LRU) cache or clear the cache when it exceeds a certain size.

### 3. Missing Dependency in `ImgToPDF` Reordering

The drag-and-drop logic in `ImgToPDF.tsx` and `PDFMerge.tsx` is manual.

- **Problem**: In `ImgToPDF.tsx`, the `useEffect` at line 38 revokes *all* URLs in `itemUrlsRef.current` on unmount, but if individual items are removed via `removeItem`, the old URLs are not always revoked immediately if the state update is batched strangely.

---

## 🟡 Performance Bottlenecks

### 1. Serial Page Processing

Most tools process pages one by one in a `for` loop.

- **Problem**: This doesn't leverage the user's CPU cores. Even though JS is single-threaded, `pdfjs` worker rendering and `pdf-lib` embedding can be parallelized.
- **Fix**: Use the `mapConcurrent` utility (currently only used in `PDFSplit.tsx`) across all tools.
- **Locations**: `PDFGrayscale.tsx`, `PDFCompress.tsx`, `PDFNup.tsx`, `PDFWatermark.tsx`.

### 2. Inefficient Pixel Manipulation

`PDFInverter` uses `Uint32Array` for custom tinting (very fast), but `PDFGrayscale` uses a standard `Uint8ClampedArray` loop.

- **Fix**: Standardize all pixel manipulation to use `Uint32Array` bitwise operations.

---

## 🟢 Architectural Suggestions

### 1. Standardize UI Patterns

- **ProcessingButton**: Ensure all tools use the recently added `ProcessingButton` and respect the `isCancelledRef`. (Most do, but some need verification on edge cases).
- **Scaling Utility**: Create a centralized utility to handle `px ↔ pt ↔ mm` conversions and viewport scaling to avoid magic numbers like `1.35`.

### 2. Standardize `canvasToObjectUrl` Usage

Most tools have been updated, but some still use `toDataURL` in sub-components or helpers (e.g., `PDFSign.tsx` for drawing).

- **Fix**: Move all image exports to `canvasToObjectUrl` or `canvasToBlob` to avoid base64 overhead.

---

## 🛠 Next Steps

I am ready to address these issues. I recommend starting with the **Hardcoded Scaling** and **Memory Management** fixes as they impact correctness and stability for large files.

**How would you like to proceed with the fixes?**
