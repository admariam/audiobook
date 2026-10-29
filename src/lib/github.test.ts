import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GithubError,
  deleteRemoteFile,
  downloadRemoteBook,
  listRemoteBooks,
  loadGithubConfig,
  safeFileName,
  saveGithubConfig,
  testConnection,
  uniqueFileName,
  uploadRemoteBook,
} from './github';
import { createFakeGithub, fakeConfig, textFile, type FakeGithub } from '../test/fakeGithub';

describe('nomes de arquivo', () => {
  it('mantém acentos e espaços e troca caracteres proibidos', () => {
    expect(safeFileName('Tratado da Verdadeira Devoção.pdf')).toBe('Tratado da Verdadeira Devoção.pdf');
    expect(safeFileName('a/b:c?.PDF')).toBe('a-b-c-.pdf');
    expect(safeFileName('sem extensão')).toBe('sem extensão.pdf');
  });

  it('evita sobrescrever um livro com o mesmo nome', () => {
    expect(uniqueFileName('Livro.pdf', ['livro.pdf'])).toBe('Livro (2).pdf');
    expect(uniqueFileName('Livro.pdf', ['Livro.pdf', 'Livro (2).pdf'])).toBe('Livro (3).pdf');
    expect(uniqueFileName('Outro.pdf', ['Livro.pdf'])).toBe('Outro.pdf');
  });
});

describe('configuração', () => {
  beforeEach(() => localStorage.clear());

  it('só considera configurado quando há token', () => {
    saveGithubConfig({ ...fakeConfig, token: '' });
    expect(loadGithubConfig()).toBeNull();
    saveGithubConfig(fakeConfig);
    expect(loadGithubConfig()).toEqual(fakeConfig);
  });
});

describe('API do GitHub', () => {
  let fake: FakeGithub;

  beforeEach(() => {
    fake = createFakeGithub();
    vi.stubGlobal('fetch', fake.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('confere a conexão e a permissão de escrita', async () => {
    await expect(testConnection(fakeConfig)).resolves.toMatchObject({ canWrite: true, isPrivate: false });
  });

  it('explica um token recusado', async () => {
    await expect(testConnection({ ...fakeConfig, token: 'errado' })).rejects.toThrow(/recusou o token/);
  });

  it('lista uma pasta inexistente como vazia', async () => {
    await expect(listRemoteBooks(fakeConfig)).resolves.toEqual([]);
  });

  it('envia, lista, baixa e apaga um PDF', async () => {
    const remote = await uploadRemoteBook(fakeConfig, textFile('%PDF conteúdo', 'x.pdf'), 'Meu livro.pdf');
    expect(remote.path).toBe('livros/Meu livro.pdf');
    expect(fake.commits).toContain('Adiciona livro: Meu livro.pdf');

    const list = await listRemoteBooks(fakeConfig);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Meu livro.pdf', path: 'livros/Meu livro.pdf' });

    const file = await downloadRemoteBook(fakeConfig, list[0]);
    expect(file.name).toBe('Meu livro.pdf');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(file);
    });
    expect(text).toBe('%PDF conteúdo');

    await deleteRemoteFile(fakeConfig, list[0].path, list[0].sha);
    await expect(listRemoteBooks(fakeConfig)).resolves.toEqual([]);
  });

  it('recusa arquivos acima do limite do GitHub sem chamar a API', async () => {
    const big = { size: 200 * 1024 * 1024 } as Blob;
    await expect(uploadRemoteBook(fakeConfig, big, 'grande.pdf')).rejects.toBeInstanceOf(GithubError);
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('avisa quando não há internet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listRemoteBooks(fakeConfig)).rejects.toThrow(/Sem conexão/);
  });
});
