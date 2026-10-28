import { useMemo } from 'react';
import { FileTextIcon } from './icons';

interface PdfFrameProps {
  objectUrl: string;
  page: number;
  title: string;
}

export function PdfFrame({ objectUrl, page, title }: PdfFrameProps) {
  const src = useMemo(() => `${objectUrl}#page=${page}&zoom=page-width&toolbar=1`, [objectUrl, page]);

  return (
    <div className="pdf-frame">
      <div className="pdf-frame__bar">
        <span className="pdf-frame__label">
          <FileTextIcon size={17} /> PDF original — página {page}
        </span>
        <a
          className="link-button"
          href={objectUrl}
          target="_blank"
          rel="noreferrer noopener"
          download
        >
          Abrir em nova aba
        </a>
      </div>
      <iframe
        key={`${objectUrl}-${page}`}
        className="pdf-frame__viewer"
        src={src}
        title={`PDF original de ${title}, página ${page}`}
      />
      <p className="pdf-frame__hint">
        A visualização usa o leitor de PDF do navegador. A reprodução em voz alta continua baseada
        no texto extraído.
      </p>
    </div>
  );
}
