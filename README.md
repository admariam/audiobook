# Audiobook Pessoal

Aplicativo web que transforma seus PDFs em audiolivros usando a síntese de voz do próprio navegador. Por padrão tudo acontece no dispositivo; opcionalmente, os PDFs e o progresso de leitura podem ser guardados numa pasta de um repositório do GitHub para continuar a leitura em outro aparelho.

**Site:** publicado automaticamente no GitHub Pages após cada envio para a branch `main`.

## Recursos

- Importação de um ou vários PDFs por seleção ou arrastar e soltar, com progresso por página.
- Extração de texto com PDF.js, incluindo capítulos a partir do sumário do PDF.
- Leitura em voz alta com Web Speech API, voz preferencial em português do Brasil, velocidade e volume ajustáveis.
- Reprodução por blocos de texto, com destaque da palavra falada, avanço automático de página e navegação manual.
- Biblioteca com busca por título/autor, ordenação e exclusão de livros.
- Leitor com tema claro/escuro, três famílias de fonte, tamanho do texto e espaçamento ajustáveis.
- Marcadores por página e bloco, painel de capítulos e visualização do PDF original.
- Biblioteca no GitHub (opcional): os PDFs importados vão para a pasta `livros/` do repositório, aparecem nos outros aparelhos para baixar, e a página em que você parou e os marcadores são sincronizados em `livros/progresso.json`.
- Backup em JSON com metadados, marcadores e preferências (os PDFs não fazem parte do backup).
- Interface responsiva, acessível por teclado e instalável como PWA: o app shell fica disponível offline após a primeira visita, e o módulo de PDF é armazenado em cache no primeiro uso.

## Tecnologias

- React 19 + TypeScript
- Vite 6
- PDF.js (`pdfjs-dist`)
- IndexedDB via `idb`
- Web Speech API
- Vitest + Testing Library
- ESLint

## Requisitos

- Node.js 20 ou superior (testado com Node 24)
- Navegador moderno com suporte a IndexedDB e Web Speech API (Chrome, Edge, Firefox e Safari recentes)

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite. O service worker é registrado somente no build de produção e requer uma origem HTTP/HTTPS (não funciona abrindo o arquivo diretamente).

### Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarregamento |
| `npm run build` | Checagem de tipos + build de produção em `dist/` |
| `npm run preview` | Pré-visualização local do build |
| `npm test` | Executa a suíte de testes uma vez |
| `npm run test:watch` | Testes em modo observador |
| `npm run lint` | Análise estática com ESLint |

> No Windows, se o PowerShell bloquear `npm.ps1` por política de execução, use `npm.cmd` no lugar de `npm`.

## Publicação no GitHub Pages

1. Envie o projeto para um repositório no GitHub.
2. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
3. Envie para a branch `main`. O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) executa lint, testes e build, e publica `dist/`.

O `base` do Vite é calculado automaticamente:

- repositório `usuario.github.io` → publicado na raiz (`/`);
- demais repositórios → publicado em `/<nome-do-repositorio>/`;
- para sobrescrever, defina `VITE_BASE` antes do build (por exemplo, `VITE_BASE=/meu-app/`).

## Como usar

1. Importe um PDF com texto selecionável.
2. Abra o livro na biblioteca.
3. Pressione **Espaço** ou o botão de reprodução para ouvir a página atual.
4. Use as setas para navegar entre blocos, ou os botões de página para mudar de página.
5. Abra as configurações para escolher voz, velocidade, volume, fonte, tema e avanço automático.
6. Crie marcadores com **M** e consulte os capítulos no painel lateral.
7. Em **Dados e backup**, exporte um JSON periodicamente. Se os dados do site forem apagados pelo navegador, o backup permite recuperar marcadores e preferências, mas não os PDFs.

### Atalhos do leitor

| Tecla | Ação |
| --- | --- |
| `Espaço` ou `K` | Reproduzir / pausar |
| `Seta direita` | Próximo bloco de texto |
| `Seta esquerda` | Bloco anterior |
| `Page Down` | Próxima página |
| `Page Up` | Página anterior |
| `M` | Adicionar marcador na página atual |
| `T` | Alternar tema claro/escuro |
| `V` | Alternar entre texto e PDF original |
| `?` | Abrir a lista de atalhos |
| `Esc` | Fechar painéis e diálogos |

Os atalhos são ignorados enquanto o foco está em um campo de texto.

## Biblioteca no GitHub

Para ler o mesmo livro no PC e no celular:

1. Crie um token em <https://github.com/settings/personal-access-tokens/new> do tipo *fine-grained*, com acesso **somente** ao repositório `audiobook` e a permissão **Contents: Read and write**.
2. No app, toque no ícone de nuvem, confira dono, repositório, branch e pasta, cole o token e salve. Repita em cada aparelho (o token fica guardado só no navegador).
3. Cada PDF importado é enviado à pasta `livros/`. Nos outros aparelhos ele aparece em “No GitHub, ainda não baixados neste aparelho”, com o botão **Baixar e ler**.
4. Ao sair do leitor, ao trocar de aplicativo e a cada dois minutos de leitura, a posição e os marcadores são gravados em `livros/progresso.json`. Ao abrir o livro em outro aparelho, o app começa da posição mais recente. Sem internet, as mudanças ficam na fila e são enviadas depois.

Observações:

- Em repositório público, os PDFs ficam acessíveis a quem encontrar o endereço do arquivo.
- O GitHub recusa arquivos acima de 100 MB; livros maiores ficam só no aparelho.
- O token fica no `localStorage` do domínio `admariam.github.io`, que é compartilhado com os outros sites publicados por essa conta no GitHub Pages. Por isso o token deve dar acesso apenas a este repositório.
- Os envios para `livros/` não disparam um novo deploy do site (`paths-ignore` no workflow).

## Privacidade e armazenamento

- PDFs, texto extraído, progresso, marcadores e preferências ficam no IndexedDB e no `localStorage` do navegador.
- Não há backend próprio nem telemetria. Com a biblioteca no GitHub ativada, os PDFs e o arquivo de progresso também são gravados no repositório configurado.
- Limpar os dados do site, usar uma janela privada ou ficar sem espaço pode remover os dados.
- O backup exportado contém apenas metadados dos livros, marcadores e preferências. Guarde os PDFs originais separadamente.
- Ao importar um backup, os marcadores são associados a livros presentes no dispositivo pelo nome/tamanho e pelo título/quantidade de páginas. Livros ausentes não são recriados.

## Limitações

- **Sem OCR:** PDFs digitalizados (imagens sem camada de texto) podem ser armazenados e visualizados, mas não têm texto para a leitura em voz alta.
- **PDFs protegidos por senha** não são suportados.
- A qualidade, a disponibilidade e o comportamento das vozes dependem do sistema operacional e do navegador. Pausa, retomada e volume podem variar entre plataformas.
- Em alguns navegadores móveis, a fala pode ser interrompida ao colocar o aplicativo em segundo plano.
- O tamanho máximo por arquivo é 300 MB, sujeito também à cota de armazenamento do navegador.
- A leitura em voz alta depende da Web Speech API; navegadores sem essa API ainda conseguem importar e ler o texto, mas não reproduzir áudio.

## Estrutura do projeto

```text
src/
  components/     Biblioteca, leitor, painéis, player e diálogos
  hooks/          Carregamento de vozes do sistema
  lib/            PDF, IndexedDB, fala, texto, backup e preferências
  test/           Configuração dos testes
  styles/         Estilos globais e temas
public/           Manifesto, service worker e ícones
.github/          Workflow de publicação no GitHub Pages
```

## Testes

A suíte cobre normalização e divisão de texto, fila de fala, IndexedDB, backup, preferências e os fluxos principais da biblioteca e do leitor.

```bash
npm test
```
