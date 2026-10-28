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

function readMetadata(
  info: Record<string, unknown> | undefined,
  fileName: string,
): { title: string; author?: string } {
  const rawTitle = typeof info?.Title === 'string' ? info.Title.trim() : '';
  const rawAuthor = typeof info?.Author === 'string' ? info.Author.trim() : '';
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

    return {
      title,
      author,
      pageCount,
      pages,
      chapters,
      needsOcr,
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
