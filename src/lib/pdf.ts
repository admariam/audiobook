import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Chapter, PageText } from '../types';
import { countReadableCharacters, normalizeExtractedText } from './text';

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfErrorCode = 'password' | 'invalid' | 'empty' | 'unknown';

export class PdfError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
  }
}

export interface ParsedPdf {
  title: string;
  author?: string;
  pageCount: number;
  pages: PageText[];
  chapters: Chapter[];
  needsOcr: boolean;
  cover?: string;
}

const COVER_HEIGHT = 360;
const COVER_MAX_WIDTH = 480;

/** Desenha a primeira página num canvas pequeno e devolve um JPEG em data URL. */
async function renderCover(doc: PDFDocumentProxy): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  try {
    const page = await doc.getPage(1);
    try {
      const base = page.getViewport({ scale: 1 });
      if (!base.width || !base.height) return undefined;
      const scale = Math.min(COVER_HEIGHT / base.height, COVER_MAX_WIDTH / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    } finally {
      page.cleanup();
    }
  } catch {
    return undefined;
  }
}

/** Gera a miniatura de um PDF já guardado (livros importados antes desta função existir). */
export async function generateCover(file: Blob): Promise<string | undefined> {
  let doc: PDFDocumentProxy | null = null;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await getDocument({ data, useSystemFonts: true }).promise;
    return await renderCover(doc);
  } catch {
    return undefined;
  } finally {
    await doc?.destroy().catch(() => undefined);
  }
}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

function itemsToText(items: unknown[]): string {
  let text = '';
  for (const raw of items) {
    const item = raw as TextItemLike;
    if (typeof item.str !== 'string') continue;
    const value = item.str;
    if (!value) {
      if (item.hasEOL) text += '\n';
      continue;
    }
    if (text && !/\s$/.test(text) && !/^[\s,.;:!?…%)\]}”’]/.test(value)) {
      text += ' ';
    }
    text += value;
    if (item.hasEOL) text += '\n';
  }
  return normalizeExtractedText(text);
}

async function readPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    return itemsToText(content.items);
  } finally {
    page.cleanup();
  }
}

async function resolveDestinationPage(
  doc: PDFDocumentProxy,
  destination: unknown,
  pageCount: number,
): Promise<number | null> {
  try {
    let explicit = destination;
    if (typeof destination === 'string') {
      explicit = await doc.getDestination(destination);
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0] as unknown;
    if (typeof target === 'number') {
      const page = Math.floor(target) + 1;
      return page >= 1 && page <= pageCount ? page : null;
    }
    if (target && typeof target === 'object') {
      const index = await doc.getPageIndex(target as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
      const page = index + 1;
      return page >= 1 && page <= pageCount ? page : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function extractChapters(doc: PDFDocumentProxy, pageCount: number): Promise<Chapter[]> {
  let outline: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!outline?.length) return [];

  const chapters: Chapter[] = [];
  const maxChapters = 600;

  const walk = async (items: typeof outline, level: number): Promise<void> => {
    for (const item of items) {
      if (chapters.length >= maxChapters) return;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (title) {
        const page = await resolveDestinationPage(doc, item.dest, pageCount);
        if (page) chapters.push({ title, page, level: Math.min(level, 5) });
      }
      const children = (item as { items?: typeof outline }).items;
      if (children?.length) {
        await walk(children, level + 1);
      }
    }
  };

  await walk(outline, 0);
  return chapters;
}

const PLACEHOLDER_METADATA = /^(untitled|sem t[ií]tulo|anonymous|unknown|desconhecido|user|usu[aá]rio|admin|owner|title|t[ií]tulo|document\d*|documento\d*)$/i;

function readMetadata(
  info: Record<string, unknown> | undefined,
  fileName: string,
): { title: string; author?: string } {
  const clean = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    // Metadados genéricos gravados por editores e geradores de PDF não servem de título.
    return PLACEHOLDER_METADATA.test(text) ? '' : text.replace(/^Microsoft Word\s*-\s*/i, '');
  };
  const rawTitle = clean(info?.Title).replace(/\.(docx?|odt|pdf)$/i, '').trim();
  const rawAuthor = clean(info?.Author);
  const fallback = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title: rawTitle || fallback || 'Livro sem título',
    author: rawAuthor || undefined,
  };
}

export interface ParsePdfOptions {
  onProgress?: (current: number, total: number) => void;
  fileName?: string;
}

export async function parsePdf(file: File, options: ParsePdfOptions = {}): Promise<ParsedPdf> {
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new PdfError('unknown', 'Não foi possível ler o arquivo selecionado.');
  }

  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });

  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') {
      throw new PdfError(
        'password',
        'Este PDF está protegido por senha. Remova a senha (por exemplo, imprimindo uma nova cópia em PDF) e tente importar novamente.',
      );
    }
    if (name === 'InvalidPDFException') {
      throw new PdfError('invalid', 'O arquivo não parece ser um PDF válido ou está corrompido.');
    }
    throw new PdfError(
      'unknown',
      'Não foi possível abrir este PDF. Verifique se o arquivo está íntegro e tente novamente.',
    );
  }

  try {
    const pageCount = doc.numPages;
    const metadata = await doc.getMetadata().catch(() => null);
    const info = metadata?.info as Record<string, unknown> | undefined;
    const { title, author } = readMetadata(info, options.fileName ?? file.name);

    const pages: PageText[] = [];
    let readableCharacters = 0;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      let text = '';
      try {
        text = await readPageText(doc, pageNumber);
      } catch {
        text = '';
      }
      readableCharacters += countReadableCharacters(text);
      pages.push({ page: pageNumber, text });
      options.onProgress?.(pageNumber, pageCount);
    }

    const chapters = await extractChapters(doc, pageCount);
    const needsOcr = readableCharacters < 20;
    const cover = await renderCover(doc);

    return {
      title,
      author,
      pageCount,
      pages,
      chapters,
      needsOcr,
      cover,
    };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

export function describePdfError(error: unknown): string {
  if (error instanceof PdfError) return error.message;
  if (error instanceof Error && error.message) {
    return `Não foi possível processar o PDF: ${error.message}`;
  }
  return 'Não foi possível processar o PDF selecionado.';
}

export type { PDFDocumentProxy };

/** Abre um PDF guardado para desenhar as páginas no próprio app (sem depender do leitor do navegador). */
export async function openPdfDocument(file: Blob): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer());
  return getDocument({ data, useSystemFonts: true }).promise;
}

export interface RenderedPage {
  cancel: () => void;
  promise: Promise<void>;
}

/** Desenha uma página no canvas na largura informada, com nitidez de tela de alta densidade. */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);
  const scale = (cssWidth / base.width) * ratio;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: context, viewport });
  return {
    cancel: () => task.cancel(),
    promise: task.promise.finally(() => page.cleanup()),
  };
}

