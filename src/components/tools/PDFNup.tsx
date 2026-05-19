"use client";

import React, { useState } from "react";
import DropZone from "@/components/DropZone";
import ProcessingButton from "@/components/ProcessingButton";
import ToolHeader from "@/components/ToolHeader";
import ToolHero from "@/components/ToolHero";
import LayoutPreview from "@/components/LayoutPreview";
import { revokeObjectUrl } from "@/lib/pdf-browser";
import { usePdfTool } from "@/hooks/usePdfTool";

const NUP_OPTIONS = [2, 4, 6, 8, 9, 16] as const;

// mm → PDF points (1 mm = 2.835 pt)
const MM = 2.835;

// Standard page sizes in points
const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};

function getGrid(n: number): { cols: number; rows: number } {
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 6) return { cols: 3, rows: 2 };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export default function PDFNup() {
  const {
    status, setStatus,
    fileName,
    errorMsg, setErrorMsg,
    progress, setProgress,
    downloadUrl, setDownloadUrl,
    fileRef,
    isCancelledRef,
    handleFile: baseHandleFile,
  } = usePdfTool();

  // Settings
  const [layoutMode, setLayoutMode] = useState<"preset" | "custom">("preset");
  const [nup, setNup] = useState<number>(4);
  const [customCols, setCustomCols] = useState(2);
  const [customRows, setCustomRows] = useState(2);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [pageSize, setPageSize] = useState<"A4" | "Letter">("A4");
  const [orientation, setOrientation] = useState<
    "portrait" | "landscape" | "auto"
  >("auto");
  const [marginTop, setMarginTop] = useState(5); // mm
  const [marginBottom, setMarginBottom] = useState(5); // mm
  const [marginLeft, setMarginLeft] = useState(10); // mm
  const [marginRight, setMarginRight] = useState(5); // mm
  const [innerMargin, setInnerMargin] = useState(5); // mm
  const [showBorder, setShowBorder] = useState(true);

  // Computed effective grid
  const effectiveGrid =
    layoutMode === "custom"
      ? { cols: customCols, rows: customRows }
      : getGrid(nup);
  const effectiveCols = effectiveGrid.cols;
  const effectiveRows = effectiveGrid.rows;

  const handleFile = (file: File) => {
    baseHandleFile(file, () => {
      setStatus("idle");
    });
  };

  const handleProcess = async () => {
    if (!fileRef.current) return;
    setStatus("processing");
    setErrorMsg("");
    setProgress("Preparing…");
    isCancelledRef.current = false;

    try {
      const { PDFDocument, rgb } = await import("pdf-lib");

      const fileBytes = await fileRef.current.arrayBuffer();
      // Load source directly with pdf-lib to retain vector quality
      const srcDoc = await PDFDocument.load(fileBytes);
      const totalPages = srcDoc.getPageCount();

      if (isCancelledRef.current) {
        setStatus("idle");
        setProgress("");
        return;
      }

      // Create output PDF
      const outDoc = await PDFDocument.create();

      setProgress("Preparing pages...");
      // For responsiveness, allow UI to update
      await new Promise((resolve) => setTimeout(resolve, 0));

      const srcPages = srcDoc.getPages();
      const embeddedPages = await outDoc.embedPages(srcPages);

      if (isCancelledRef.current) {
        setStatus("idle");
        setProgress("");
        return;
      }

      const cols = effectiveCols;
      const rows = effectiveRows;
      const pagesPerSheet = cols * rows;

      // Determine output page dimensions
      const base = PAGE_SIZES[pageSize];
      let outW: number, outH: number;
      if (orientation === "landscape") {
        outW = Math.max(base.w, base.h);
        outH = Math.min(base.w, base.h);
      } else if (orientation === "portrait") {
        outW = Math.min(base.w, base.h);
        outH = Math.max(base.w, base.h);
      } else {
        // auto: landscape if cols > rows, portrait otherwise
        if (cols > rows) {
          outW = Math.max(base.w, base.h);
          outH = Math.min(base.w, base.h);
        } else {
          outW = Math.min(base.w, base.h);
          outH = Math.max(base.w, base.h);
        }
      }

      const mt = marginTop * MM; // top margin in points
      const mb = marginBottom * MM; // bottom margin in points
      const ml = marginLeft * MM; // left margin in points
      const mr = marginRight * MM; // right margin in points
      const im = innerMargin * MM; // inner margin in points

      // Usable area
      const usableW = outW - ml - mr;
      const usableH = outH - mt - mb;

      // Cell size (including inner margin)
      const cellW = (usableW - (cols - 1) * im) / cols;
      const cellH = (usableH - (rows - 1) * im) / rows;

      const totalSheets = Math.ceil(totalPages / pagesPerSheet);

      for (let sheet = 0; sheet < totalSheets; sheet++) {
        if (isCancelledRef.current) {
          setStatus("idle");
          setProgress("");
          return;
        }
        setProgress(`Sheet ${sheet + 1}/${totalSheets}…`);
        const outPage = outDoc.addPage([outW, outH]);

        for (let slot = 0; slot < pagesPerSheet; slot++) {
          const pageIdx = sheet * pagesPerSheet + slot;
          if (pageIdx >= totalPages) break;
          
          const embeddedPage = embeddedPages[pageIdx];
          const srcPage = srcPages[pageIdx];
          const { width: srcW, height: srcH } = srcPage.getSize();
          
          const scale = Math.min(cellW / srcW, cellH / srcH);
          
          const row = Math.floor(slot / cols);
          let col = slot % cols;
          if (direction === "rtl") col = cols - 1 - col;

          const drawW = srcW * scale;
          const drawH = srcH * scale;
          const cellX = ml + col * (cellW + im);
          const cellY = outH - mt - (row + 1) * cellH - row * im;
          const offsetX = (cellW - drawW) / 2;
          const offsetY = (cellH - drawH) / 2;

          outPage.drawPage(embeddedPage, {
            x: cellX + offsetX,
            y: cellY + offsetY,
            width: drawW,
            height: drawH,
          });

          if (showBorder) {
            outPage.drawRectangle({
              x: cellX + offsetX,
              y: cellY + offsetY,
              width: drawW,
              height: drawH,
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 0.5,
              opacity: 0,
            });
          }
        }
      }

      if (isCancelledRef.current) {
        setStatus("idle");
        setProgress("");
        return;
      }
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      setDownloadUrl((prev) => {
        revokeObjectUrl(prev);
        return URL.createObjectURL(blob);
      });
      setProgress("");
      setStatus("done");
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to create N-up PDF.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white flex flex-col">
      <ToolHeader icon="📐" title="Multiple Pages Per Sheet" />
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full flex flex-col gap-5">
        <ToolHero
          icon="📐"
          title="Pages Per Sheet"
          description="Arrange multiple pages on a single sheet of paper (2-up, 4-up, etc.)."
        />
        <div className="bg-gray-900 rounded-2xl border border-gray-700/50 p-5 flex flex-col gap-5">
          <DropZone onFile={handleFile} fileName={fileName} />

          {fileName && (
            <>
              {/* Layout Mode Toggle */}
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                  Layout Mode
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setLayoutMode("preset")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${layoutMode === "preset" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                  >
                    📋 Preset
                  </button>
                  <button
                    onClick={() => setLayoutMode("custom")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${layoutMode === "custom" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                  >
                    ✏️ Custom Rows × Cols
                  </button>
                </div>

                {layoutMode === "preset" ? (
                  <>
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                      Pages per sheet
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {NUP_OPTIONS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setNup(n)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${nup === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Columns
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <button
                            key={n}
                            onClick={() => setCustomCols(n)}
                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${customCols === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Rows
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <button
                            key={n}
                            onClick={() => setCustomRows(n)}
                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${customRows === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2">
                      Grid: {customCols} × {customRows} ={" "}
                      <span className="text-indigo-400 font-semibold">
                        {customCols * customRows} pages per sheet
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Reading Direction */}
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                    Reading Direction
                  </label>
                  <div className="flex gap-2">
                    {[
                      { val: "ltr" as const, label: "Left → Right" },
                      { val: "rtl" as const, label: "Right → Left" },
                    ].map((d) => (
                      <button
                        key={d.val}
                        onClick={() => setDirection(d.val)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${direction === d.val ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Size */}
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                    Page Size
                  </label>
                  <div className="flex gap-2">
                    {(["A4", "Letter"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setPageSize(s)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${pageSize === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                  Orientation
                </label>
                <div className="flex gap-2">
                  {[
                    { val: "auto" as const, label: "🔄 Auto" },
                    { val: "portrait" as const, label: "📄 Portrait" },
                    { val: "landscape" as const, label: "📃 Landscape" },
                  ].map((o) => (
                    <button
                      key={o.val}
                      onClick={() => setOrientation(o.val)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${orientation === o.val ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Outer Margins */}
                <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">
                      Outer Margins (mm)
                    </label>
                  </div>
                  <div className="mb-3 border-b border-gray-700/50 pb-3">
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={
                        marginTop === marginBottom &&
                        marginTop === marginLeft &&
                        marginTop === marginRight
                          ? marginTop
                          : Math.max(marginTop, marginBottom, marginLeft, marginRight)
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setMarginTop(val);
                        setMarginBottom(val);
                        setMarginLeft(val);
                        setMarginRight(val);
                      }}
                      className="w-full accent-indigo-500"
                      title="Adjust all outer margins simultaneously"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 text-right">
                        Top:
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={marginTop}
                        onChange={(e) =>
                          setMarginTop(Number(e.target.value) || 0)
                        }
                        className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-center outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 text-right">
                        Bottom:
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={marginBottom}
                        onChange={(e) =>
                          setMarginBottom(Number(e.target.value) || 0)
                        }
                        className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-center outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 text-right">
                        Left:
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={marginLeft}
                        onChange={(e) =>
                          setMarginLeft(Number(e.target.value) || 0)
                        }
                        className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-center outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 text-right">
                        Right:
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={marginRight}
                        onChange={(e) =>
                          setMarginRight(Number(e.target.value) || 0)
                        }
                        className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-center outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Inner Margin */}
                <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 flex flex-col justify-center">
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                    Inner Margin: {innerMargin} mm
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={innerMargin}
                    onChange={(e) => setInnerMargin(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>

              {/* Border */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBorder}
                  onChange={(e) => setShowBorder(e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-800 border-gray-600 text-indigo-500 accent-indigo-500"
                />
                <span className="text-sm text-gray-300">
                  Draw border around each page
                </span>
              </label>

              {/* ── Interactive Layout Preview ── */}
              <LayoutPreview
                cols={effectiveCols}
                rows={effectiveRows}
                orientation={orientation}
                marginTop={marginTop}
                marginBottom={marginBottom}
                marginLeft={marginLeft}
                marginRight={marginRight}
                innerMargin={innerMargin}
                showBorder={showBorder}
                direction={direction}
              />

              {/* Process Button */}
              <ProcessingButton
                onClick={handleProcess}
                onCancel={() => {
                  isCancelledRef.current = true;
                }}
                isProcessing={status === "processing"}
                idleLabel="📐 Create N-up PDF"
                processingLabel={progress || "Processing…"}
              />

              {status === "done" && downloadUrl && (
                <a
                  href={downloadUrl}
                  download={layoutMode === "custom"
                    ? `nup-custom-${customCols}x${customRows}-${fileName}`
                    : `nup-${nup}-${fileName}`
                  }
                  className="w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                >
                  ⬇️ Download PDF
                </a>
              )}

              {errorMsg && (
                <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>
              )}
            </>
          )}
        </div>
        <p className="mt-5 text-center text-gray-600 text-xs">
          🔒 Processed locally — nothing uploaded.
        </p>
      </div>
    </div>
  );
}
