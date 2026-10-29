/**
 * Integração com um repositório do GitHub usado como "nuvem" pessoal:
 * os PDFs ficam numa pasta do repositório e o progresso de leitura num JSON
 * na mesma pasta, para continuar a leitura em outro aparelho.
 *
 * Toda a comunicação usa a API REST do GitHub com um token pessoal
 * (fine-grained, com permissão de leitura e escrita em "Contents").
 */

export interface GithubConfig {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
  token: string;
}

export interface RemoteBook {
  name: string;
  path: string;
  size: number;
  sha: string;
}

export interface RemoteJson<T> {
  data: T | null;
  sha: string | null;
}

const STORAGE_KEY = 'audiobook-pessoal:github:v1';
const API = 'https://api.github.com';

/** O GitHub recusa arquivos acima de 100 MB em repositórios comuns. */
export const GITHUB_MAX_FILE_SIZE = 95 * 1024 * 1024;

export const SYNC_FILE_NAME = 'progresso.json';

export class GithubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

/* ---------------------------------------------------------------- config */

/** Sugere dono e repositório a partir do endereço do GitHub Pages. */
export function suggestGithubConfig(): GithubConfig {
  const base: GithubConfig = { owner: '', repo: '', branch: 'main', folder: 'livros', token: '' };
  if (typeof window === 'undefined') return base;
  const host = window.location.hostname.toLowerCase();
  const match = host.match(/^([a-z0-9-]+)\.github\.io$/);
  if (!match) return base;
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
  return {
    ...base,
    owner: match[1],
    repo: firstSegment ? decodeURIComponent(firstSegment) : `${match[1]}.github.io`,
  };
}

function cleanSegment(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeGithubConfig(raw: unknown): GithubConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const config: GithubConfig = {
    owner: cleanSegment(record.owner),
    repo: cleanSegment(record.repo),
    branch: cleanSegment(record.branch) || 'main',
    folder: cleanSegment(record.folder).replace(/^\/+|\/+$/g, '') || 'livros',
    token: cleanSegment(record.token),
  };
  return isGithubConfigComplete(config) ? config : null;
}

export function isGithubConfigComplete(config: GithubConfig | null | undefined): config is GithubConfig {
  return Boolean(config && config.owner && config.repo && config.branch && config.folder && config.token);
}

export function loadGithubConfig(): GithubConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeGithubConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveGithubConfig(config: GithubConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearGithubConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

/* -------------------------------------------------------------- helpers */

export function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/** Nome de arquivo seguro para o repositório, preservando acentos e espaços. */
export function safeFileName(name: string): string {
  const cleaned = Array.from(name)
    .filter((char) => (char.codePointAt(0) ?? 0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned.replace(/\.pdf$/i, '').replace(/^\.+/, '') || 'livro';
  return `${base}.pdf`;
}

/** Escolhe um nome que ainda não existe na pasta, acrescentando " (2)", " (3)"… */
export function uniqueFileName(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (value) => value.toLowerCase()));
  const safe = safeFileName(name);
  if (!used.has(safe.toLowerCase())) return safe;
  const base = safe.replace(/\.pdf$/i, '');
  for (let counter = 2; counter < 1000; counter += 1) {
    const candidate = `${base} (${counter}).pdf`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()}).pdf`;
}

export function remoteTitle(name: string): string {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function describeStatus(status: number, apiMessage: string): string {
  switch (status) {
    case 401:
      return 'O GitHub recusou o token. Ele pode ter expirado ou sido digitado errado.';
    case 403:
      if (/rate limit/i.test(apiMessage)) {
        return 'O limite de requisições do GitHub foi atingido. Tente de novo em alguns minutos.';
      }
      return 'O token não tem permissão para esta ação. Confira se ele dá acesso de leitura e escrita a "Contents" neste repositório.';
    case 404:
      return 'Repositório, branch ou arquivo não encontrado no GitHub. Confira o dono, o nome do repositório e a branch.';
    case 409:
    case 422:
      return 'O GitHub recusou a gravação porque o repositório mudou ao mesmo tempo. Tente novamente.';
    default:
      if (status >= 500) return 'O GitHub está instável no momento. Tente novamente em instantes.';
      return apiMessage
        ? `O GitHub respondeu com um erro: ${apiMessage}`
        : 'O GitHub respondeu com um erro inesperado.';
  }
}

async function request(
  config: GithubConfig,
  path: string,
  init: RequestInit & { accept?: string } = {},
): Promise<Response> {
  const { accept, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`, {
      cache: 'no-store',
      ...rest,
      headers: {
        Accept: accept ?? 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new GithubError(0, 'Sem conexão com o GitHub. Verifique a internet e tente novamente.');
  }
  return response;
}

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  let apiMessage = '';
  try {
    const body = (await response.json()) as { message?: string };
    apiMessage = body?.message ?? '';
  } catch {
    apiMessage = '';
  }
  throw new GithubError(response.status, describeStatus(response.status, apiMessage));
}

async function requestJson<T>(
  config: GithubConfig,
  path: string,
  init: RequestInit & { accept?: string } = {},
): Promise<T> {
  const response = await ensureOk(await request(config, path, init));
  return (await response.json()) as T;
}

/** Converte o conteúdo de um Blob para base64 sem estourar a pilha em arquivos grandes. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------ operações */

export interface ConnectionInfo {
  canWrite: boolean;
  isPrivate: boolean;
  fullName: string;
}

export async function testConnection(config: GithubConfig): Promise<ConnectionInfo> {
  const repo = await requestJson<{
    full_name: string;
    private: boolean;
    permissions?: { push?: boolean };
  }>(config, '');
  await requestJson(config, `/branches/${encodeURIComponent(config.branch)}`);
  return {
    canWrite: Boolean(repo.permissions?.push),
    isPrivate: repo.private,
    fullName: repo.full_name,
  };
}

interface ContentEntry {
  type: string;
  name: string;
  path: string;
  size: number;
  sha: string;
}

export async function listRemoteBooks(config: GithubConfig): Promise<RemoteBook[]> {
  const response = await request(
    config,
    `/contents/${encodePath(config.folder)}?ref=${encodeURIComponent(config.branch)}`,
  );
  if (response.status === 404) return [];
  await ensureOk(response);
  const entries = (await response.json()) as ContentEntry[] | ContentEntry;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry.type === 'file' && /\.pdf$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, path: entry.path, size: entry.size, sha: entry.sha }));
}

export async function downloadRemoteBook(config: GithubConfig, book: RemoteBook): Promise<File> {
  const response = await ensureOk(
    await request(config, `/contents/${encodePath(book.path)}?ref=${encodeURIComponent(config.branch)}`, {
      accept: 'application/vnd.github.raw',
    }),
  );
  const buffer = await response.arrayBuffer();
  return new File([buffer], book.name, { type: 'application/pdf' });
}

interface TreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string;
}

async function commitEntries(config: GithubConfig, entries: TreeEntry[], message: string): Promise<void> {
  const branch = encodeURIComponent(config.branch);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ref = await requestJson<{ object: { sha: string } }>(config, `/git/ref/heads/${branch}`);
    const parent = await requestJson<{ tree: { sha: string } }>(
      config,
      `/git/commits/${ref.object.sha}`,
    );
    const tree = await requestJson<{ sha: string }>(config, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
    });
    const commit = await requestJson<{ sha: string }>(config, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
    });
    try {
      await requestJson(config, `/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return;
    } catch (error) {
      lastError = error;
      // 422: outro aparelho gravou no meio do caminho; refaz a partir do novo commit.
      if (!(error instanceof GithubError) || error.status !== 422) throw error;
    }
  }
  throw lastError;
}

/**
 * Envia um PDF para a pasta configurada usando a API Git Data,
 * que aceita arquivos maiores do que a API de conteúdo.
 */
export async function uploadRemoteBook(
  config: GithubConfig,
  file: Blob,
  fileName: string,
): Promise<RemoteBook> {
  if (file.size > GITHUB_MAX_FILE_SIZE) {
    throw new GithubError(
      413,
      'O GitHub não aceita arquivos acima de 100 MB. Este livro ficará salvo só neste aparelho.',
    );
  }
  const content = await blobToBase64(file);
  const blob = await requestJson<{ sha: string }>(config, '/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content, encoding: 'base64' }),
  });
  const path = joinPath(config.folder, fileName);
  await commitEntries(
    config,
    [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
    `Adiciona livro: ${fileName}`,
  );
  return { name: fileName, path, size: file.size, sha: blob.sha };
}

export async function deleteRemoteFile(config: GithubConfig, path: string, sha: string): Promise<void> {
  const name = path.split('/').pop() ?? path;
  await requestJson(config, `/contents/${encodePath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Remove livro: ${name}`, sha, branch: config.branch }),
  });
}

export async function readRemoteJson<T>(config: GithubConfig, path: string): Promise<RemoteJson<T>> {
  const response = await request(
    config,
    `/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`,
  );
  if (response.status === 404) return { data: null, sha: null };
  await ensureOk(response);
  const body = (await response.json()) as { content?: string; sha: string; encoding?: string };
  if (!body.content) return { data: null, sha: body.sha };
  try {
    return { data: JSON.parse(base64ToUtf8(body.content)) as T, sha: body.sha };
  } catch {
    return { data: null, sha: body.sha };
  }
}

export async function writeRemoteJson(
  config: GithubConfig,
  path: string,
  data: unknown,
  sha: string | null,
  message: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    message,
    branch: config.branch,
    content: utf8ToBase64(`${JSON.stringify(data, null, 2)}\n`),
  };
  if (sha) body.sha = sha;
  const result = await requestJson<{ content: { sha: string } }>(
    config,
    `/contents/${encodePath(path)}`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  return result.content.sha;
}

export function syncFilePath(config: GithubConfig): string {
  return joinPath(config.folder, SYNC_FILE_NAME);
}
