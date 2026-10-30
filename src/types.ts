export type Theme = 'light' | 'dark';
export type ViewMode = 'text' | 'pdf';
export type FontKey = 'serif' | 'sans' | 'mono';
export type SortKey = 'title' | 'importedAt' | 'lastOpenedAt';

export interface Chapter {
  title: string;
  page: number;
  level: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  size: number;
  importedAt: number;
  lastOpenedAt: number | null;
  pageCount: number;
  currentPage: number;
  lastChunkIndex: number;
  progress: number;
  hasText: boolean;
  needsOcr: boolean;
  chapters: Chapter[];
  /** Caminho do PDF no repositório do GitHub, quando o livro está sincronizado. */
  remotePath?: string;
  /** Miniatura da primeira página (data URL JPEG); string vazia quando não foi possível gerar. */
  cover?: string;
  /** Quando a posição de leitura (página e trecho) mudou pela última vez. */
  positionUpdatedAt?: number;
}

export interface PageText {
  page: number;
  text: string;
  /** Notas de rodapé e legendas: aparecem na tela, mas não são lidas em voz alta. */
  notes?: string;
}

export interface BookContent {
  bookId: string;
  pages: PageText[];
  extractedAt: number;
  /** Versão da extração de texto; versões antigas são refeitas ao abrir o livro. */
  textVersion?: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  page: number;
  chunkIndex: number;
  label: string;
  createdAt: number;
}

export interface Preferences {
  theme: Theme;
  fontFamily: FontKey;
  fontSize: number;
  lineHeight: number;
  voiceURI: string | null;
  rate: number;
  volume: number;
  autoAdvance: boolean;
  viewMode: ViewMode;
  lastBookId: string | null;
}

export interface BackupFile {
  app: 'audiobook-pessoal';
  version: 1;
  exportedAt: number;
  books: Array<Pick<BookMeta, 'id' | 'title' | 'author' | 'fileName' | 'size' | 'pageCount'>>;
  bookmarks: Bookmark[];
  preferences: Preferences;
}

export interface BackupImportResult {
  bookmarksRestored: number;
  bookmarksSkipped: number;
  preferencesRestored: boolean;
  booksMatched: number;
  booksUnmatched: number;
}

export interface TextChunk {
  text: string;
  start: number;
  end: number;
}
