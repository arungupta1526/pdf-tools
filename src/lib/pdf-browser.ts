'use client';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

export type PdfJsDocument = Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>;

type RenderPageOptions = {
    scale?: number;
    background?: string;
    willReadFrequently?: boolean;
};

type ExportImageOptions = RenderPageOptions & {
    type?: string;
    quality?: number;
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

function getBasePath() {
    return process.env.NEXT_PUBLIC_BASE_PATH ?? '';
}

function getCMapUrl() {
    const basePath = getBasePath();
    return `${basePath}/cmaps/`.replace(/\/{2,}/g, '/');
}

export async function getPdfJs(): Promise<PdfJsModule> {
    if (!pdfjsPromise) {
        pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
                import.meta.url
            ).toString();
            return pdfjs;
        });
    }

    return pdfjsPromise;
}

export async function loadPdfDocument(source: ArrayBuffer | Uint8Array): Promise<PdfJsDocument> {
    const pdfjs = await getPdfJs();
    const data = source instanceof Uint8Array ? source : new Uint8Array(source);

    return pdfjs.getDocument({
        data,
        cMapUrl: getCMapUrl(),
        cMapPacked: true,
    }).promise as Promise<PdfJsDocument>;
}

export function revokeObjectUrl(url: string | null) {
    if (url) {
        URL.revokeObjectURL(url);
    }
}

function hasFileExtension(name: string, extensions: string[]) {
    const lowerName = name.toLowerCase();
    return extensions.some((extension) => lowerName.endsWith(extension));
}

export function isPdfFile(file: Pick<File, 'name' | 'type'>) {
    const type = file.type.toLowerCase();
    return type === 'application/pdf' || type === 'application/x-pdf' || hasFileExtension(file.name, ['.pdf']);
}

export function isImageFile(file: Pick<File, 'name' | 'type'>) {
    return file.type.startsWith('image/') || hasFileExtension(file.name, ['.jpg', '.jpeg', '.png', '.webp', '.gif']);
}

export function isJpegFile(file: Pick<File, 'name' | 'type'>) {
    return file.type === 'image/jpeg' || hasFileExtension(file.name, ['.jpg', '.jpeg']);
}

export function isPngFile(file: Pick<File, 'name' | 'type'>) {
    return file.type === 'image/png' || hasFileExtension(file.name, ['.png']);
}

export async function canvasToBlob(
    canvas: HTMLCanvasElement,
    type = 'image/jpeg',
    quality?: number
): Promise<Blob> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) {
        throw new Error('Canvas export failed.');
    }

    return blob;
}

export async function canvasToObjectUrl(
    canvas: HTMLCanvasElement,
    type = 'image/jpeg',
    quality?: number
): Promise<string> {
    const blob = await canvasToBlob(canvas, type, quality);
    return URL.createObjectURL(blob);
}

export async function renderPdfPageToCanvas(
    doc: PdfJsDocument,
    pageNumber: number,
    options: RenderPageOptions = {}
): Promise<HTMLCanvasElement> {
    const { scale = 1.5, background = '#ffffff', willReadFrequently = false } = options;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const ctx = canvas.getContext('2d', { willReadFrequently });
    if (!ctx) {
        throw new Error('Canvas context unavailable.');
    }

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
        canvasContext: ctx,
        viewport,
    } as Parameters<typeof page.render>[0]).promise;

    return canvas;
}

export async function renderPdfPageImage(
    doc: PdfJsDocument,
    pageNumber: number,
    options: ExportImageOptions = {}
): Promise<string> {
    const { type = 'image/jpeg', quality = 0.8, ...renderOptions } = options;
    const canvas = await renderPdfPageToCanvas(doc, pageNumber, renderOptions);
    return canvasToObjectUrl(canvas, type, quality);
}

export async function mapConcurrent<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) {
        return [];
    }

    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    };

    const workerCount = Math.min(Math.max(1, concurrency), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results;
}
