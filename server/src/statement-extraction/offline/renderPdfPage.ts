
import type { Box, RenderedPdfPage } from './types';

type PdfJsShape = {
  getDocument: (args: { data: Uint8Array; disableWorker?: boolean }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (args: { scale: number }) => { width: number; height: number };
        render: (args: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
          promise: Promise<void>;
        };
      }>;
    }>;
  };
};

let pdfJsPromise: Promise<PdfJsShape> | null = null;
let canvasModulePromise: Promise<{
  createCanvas: (width: number, height: number) => any;
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
  Image?: unknown;
  Canvas?: unknown;
}> | null = null;

const loadCanvasModule = async () => {
  if (!canvasModulePromise) {
    canvasModulePromise = import('canvas')
      .then((mod) => mod as unknown as {
        createCanvas: (width: number, height: number) => any;
        DOMMatrix?: unknown;
        ImageData?: unknown;
        Path2D?: unknown;
        Image?: unknown;
        Canvas?: unknown;
      });
  }
  return canvasModulePromise;
};

const ensureCanvasGlobals = async () => {
  const canvas = await loadCanvasModule();
  if (!(globalThis as Record<string, unknown>).DOMMatrix && canvas.DOMMatrix) {
    (globalThis as Record<string, unknown>).DOMMatrix = canvas.DOMMatrix;
  }
  if (!(globalThis as Record<string, unknown>).ImageData && canvas.ImageData) {
    (globalThis as Record<string, unknown>).ImageData = canvas.ImageData;
  }
  if (!(globalThis as Record<string, unknown>).Path2D && canvas.Path2D) {
    (globalThis as Record<string, unknown>).Path2D = canvas.Path2D;
  }
  if (!(globalThis as Record<string, unknown>).Image && canvas.Image) {
    (globalThis as Record<string, unknown>).Image = canvas.Image;
  }
  if (!(globalThis as Record<string, unknown>).Canvas && canvas.Canvas) {
    (globalThis as Record<string, unknown>).Canvas = canvas.Canvas;
  }
};

const loadPdfJs = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => mod as unknown as PdfJsShape);
  }
  return pdfJsPromise;
};

export const renderPdfPageToBuffer = async (
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2
): Promise<RenderedPdfPage> => {
  try {
    const canvasModule = await loadCanvasModule();
    await ensureCanvasGlobals();
    const pdfjs = await loadPdfJs();
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');

    const canvasFactory = {
      create: (width: number, height: number) => {
        const c = canvasModule.createCanvas(width, height);
        return { canvas: c, context: c.getContext('2d') };
      },
      reset: (ctx: { canvas: any; context: any }, width: number, height: number) => {
        ctx.canvas.width = width;
        ctx.canvas.height = height;
      },
      destroy: (ctx: { canvas: any; context: any }) => {
        ctx.canvas.width = 0;
        ctx.canvas.height = 0;
        ctx.canvas = null;
        ctx.context = null;
      }
    };

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory
    }).promise;

    return {
      pageNumber,
      width: Math.ceil(viewport.width),
      height: Math.ceil(viewport.height),
      scale,
      buffer: canvas.toBuffer('image/png')
    };
  } catch (error) {
    throw error;
  }
};

export const getPdfPageCount = async (pdfBuffer: Buffer): Promise<number> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(pdfBuffer);
  const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  return Number(pdf.numPages ?? 0);
};

export const renderPdfPageToPng = async (
  pdfPath: string,
  pageNumber: number,
  outputPath: string,
  scale = 2
) => {
  const fs = await import('node:fs');
  const page = await renderPdfPageToBuffer(fs.readFileSync(pdfPath), pageNumber, scale);
  fs.writeFileSync(outputPath, page.buffer);
  return {
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    scale: page.scale,
    outputPath
  };
};

export const scalePdfBoxToImageBox = (box: Box, scale: number): Box => ({
  left: box.left * scale,
  top: box.top * scale,
  width: box.width * scale,
  height: box.height * scale
});
