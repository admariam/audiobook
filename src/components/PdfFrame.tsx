import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderedPage } from '../lib/pdf';
import { FileTextIcon } from './icons';

interface PdfFrameProps {
  objectUrl: string;
  file: Blob | null;
  page: number;
  title: string;
}

/**
 * Mostra a página do PDF original desenhada com o PDF.js.
 * O leitor embutido do navegador não existe no Chrome do Android (lá aparece só
 * um botão "Abrir"), então o app desenha a página ele mesmo.
 */
export function PdfFrame({ objectUrl, file, page, title }: PdfFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!file) return;
    let active = true;
    let opened: PDFDocumentProxy | null = null;
    setState('loading');
    void (async () => {
      try {
        const pdf = await import('../lib/pdf');
        opened = await pdf.openPdfDocument(file);
        if (active) setDoc(opened);
        else void opened.destroy();
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
      setDoc(null);
      if (opened) void opened.destroy().catch(() => undefined);
    };
  }, [file]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || width <= 0) return;
    let rendering: RenderedPage | null = null;
    let active = true;
    setState('loading');
    void (async () => {
      try {
        const pdf = await import('../lib/pdf');
        const target = Math.min(Math.max(1, page), doc.numPages);
        rendering = await pdf.renderPageToCanvas(doc, target, canvas, width);
        if (!active) {
          rendering.cancel();
          return;
        }
        await rendering.promise;
        if (active) setState('ready');
      } catch (error) {
        const cancelled = (error as { name?: string })?.name === 'RenderingCancelledException';
        if (active && !cancelled) setState('error');
      }
    })();
    return () => {
      active = false;
      rendering?.cancel();
    };
  }, [doc, page, width]);

  return (
    <div className="pdf-frame">
      <div className="pdf-frame__bar">
        <span className="pdf-frame__label">
          <FileTextIcon size={17} /> PDF original, página {page}
        </span>
        <a className="link-button" href={objectUrl} download={`${title}.pdf`}>
          Baixar PDF
        </a>
      </div>
      <div ref={containerRef} className="pdf-frame__viewer" aria-busy={state === 'loading'}>
        <canvas
          ref={canvasRef}
          className={`pdf-frame__canvas ${state === 'ready' ? 'is-ready' : ''}`}
          role="img"
          aria-label={`PDF original de ${title}, página ${page}`}
        />
        {state === 'loading' ? (
          <span className="pdf-frame__status">
            <span className="spinner" aria-hidden="true" /> Carregando a página…
          </span>
        ) : null}
        {state === 'error' ? (
          <span className="pdf-frame__status">Não foi possível mostrar esta página do PDF.</span>
        ) : null}
      </div>
    </div>
  );
}
