/**
 * GitHub falso, em memória, para os testes: atende o subconjunto da API REST
 * usado pelo app (contents, git/blobs, git/trees, git/commits, git/refs).
 */
import { vi } from 'vitest';

interface FakeFile {
  content: Uint8Array;
  sha: string;
}

export interface FakeGithub {
  files: Map<string, FakeFile>;
  commits: string[];
  fetch: ReturnType<typeof vi.fn>;
  /** Faz a próxima gravação de progresso falhar com conflito (outro aparelho gravou antes). */
  failNextJsonWrite: () => void;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function readFakeJson(fake: FakeGithub, path: string): unknown {
  const file = fake.files.get(path);
  return file ? JSON.parse(new TextDecoder().decode(file.content)) : null;
}

export function createFakeGithub(owner = 'admariam', repo = 'audiobook'): FakeGithub {
  const files = new Map<string, FakeFile>();
  const blobs = new Map<string, Uint8Array>();
  const trees = new Map<string, Map<string, string>>();
  const commitTrees = new Map<string, string>();
  const commits: string[] = [];
  let head = 'commit-0';
  let counter = 0;
  let conflictNext = false;

  commitTrees.set(head, 'tree-0');
  trees.set('tree-0', new Map());

  const nextSha = (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const prefix = `https://api.github.com/repos/${owner}/${repo}`;

  const handler = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (!url.href.startsWith(prefix)) return json(404, { message: 'Not Found' });
    if (headers.Authorization !== 'Bearer token-ok') return json(401, { message: 'Bad credentials' });

    const path = decodeURIComponent(url.pathname.slice(new URL(prefix).pathname.length));
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (path === '' && method === 'GET') {
      return json(200, { full_name: `${owner}/${repo}`, private: false, permissions: { push: true } });
    }
    if (path.startsWith('/branches/')) return json(200, { name: 'main' });

    if (path.startsWith('/contents/')) {
      const filePath = path.slice('/contents/'.length);
      if (method === 'GET') {
        const file = files.get(filePath);
        if (file) {
          if (headers.Accept === 'application/vnd.github.raw') {
            return new Response(file.content.slice(), { status: 200 });
          }
          return json(200, { type: 'file', sha: file.sha, content: toBase64(file.content), encoding: 'base64' });
        }
        const children = Array.from(files.entries())
          .filter(([key]) => key.startsWith(`${filePath}/`) && !key.slice(filePath.length + 1).includes('/'))
          .map(([key, value]) => ({
            type: 'file',
            name: key.slice(filePath.length + 1),
            path: key,
            size: value.content.length,
            sha: value.sha,
          }));
        return children.length ? json(200, children) : json(404, { message: 'Not Found' });
      }
      if (method === 'PUT') {
        const existing = files.get(filePath);
        if (conflictNext) {
          conflictNext = false;
          return json(409, { message: 'conflict' });
        }
        if (existing && body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
        if (!existing && body.sha) return json(422, { message: 'sha for missing file' });
        const sha = nextSha('file');
        files.set(filePath, { content: fromBase64(String(body.content)), sha });
        commits.push(String(body.message));
        return json(existing ? 200 : 201, { content: { sha, path: filePath } });
      }
      if (method === 'DELETE') {
        const existing = files.get(filePath);
        if (!existing) return json(404, { message: 'Not Found' });
        if (body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
        files.delete(filePath);
        commits.push(String(body.message));
        return json(200, { commit: {} });
      }
    }

    if (path === '/git/blobs' && method === 'POST') {
      const sha = nextSha('blob');
      blobs.set(sha, fromBase64(String(body.content)));
      return json(201, { sha });
    }
    if (path.startsWith('/git/ref/heads/')) return json(200, { object: { sha: head } });
    if (path.startsWith('/git/commits/') && method === 'GET') {
      const sha = path.slice('/git/commits/'.length);
      return json(200, { tree: { sha: commitTrees.get(sha) } });
    }
    if (path === '/git/trees' && method === 'POST') {
      const sha = nextSha('tree');
      const entries = new Map(trees.get(String(body.base_tree)) ?? []);
      for (const entry of body.tree as Array<{ path: string; sha: string }>) {
        entries.set(entry.path, entry.sha);
      }
      trees.set(sha, entries);
      return json(201, { sha });
    }
    if (path === '/git/commits' && method === 'POST') {
      const sha = nextSha('commit');
      commitTrees.set(sha, String(body.tree));
      commits.push(String(body.message));
      return json(201, { sha });
    }
    if (path.startsWith('/git/refs/heads/') && method === 'PATCH') {
      head = String(body.sha);
      const tree = trees.get(commitTrees.get(head) ?? '') ?? new Map<string, string>();
      for (const [filePath, blobSha] of tree) {
        const blob = blobs.get(blobSha);
        if (blob && !files.has(filePath)) files.set(filePath, { content: blob, sha: blobSha });
      }
      return json(200, { object: { sha: head } });
    }

    return json(404, { message: `Rota não simulada: ${method} ${path}` });
  };

  const fetchMock = vi.fn(handler);
  return {
    files,
    commits,
    fetch: fetchMock,
    failNextJsonWrite: () => {
      conflictNext = true;
    },
  };
}

export const fakeConfig = {
  owner: 'admariam',
  repo: 'audiobook',
  branch: 'main',
  folder: 'livros',
  token: 'token-ok',
};

export function textFile(content: string, name: string): File {
  return new File([encoder.encode(content)], name, { type: 'application/pdf' });
}
