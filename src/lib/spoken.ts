/**
 * Prepara o texto para a voz: o que está escrito de um jeito e deve ser
 * falado de outro (referências bíblicas, abreviações, romanos, ordinais),
 * e o que está na página mas não deve ser lido (números de nota e de parágrafo).
 */

/* ------------------------------------------------------------- números */

const ORDINAL_UNITS = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const ORDINAL_TENS = [
  '',
  'décimo',
  'vigésimo',
  'trigésimo',
  'quadragésimo',
  'quinquagésimo',
  'sexagésimo',
  'septuagésimo',
  'octogésimo',
  'nonagésimo',
];
const ORDINAL_HUNDREDS = [
  '',
  'centésimo',
  'ducentésimo',
  'trecentésimo',
  'quadringentésimo',
  'quingentésimo',
  'sexcentésimo',
  'septingentésimo',
  'octingentésimo',
  'noningentésimo',
];

/** 1 → "primeiro", 23 → "vigésimo terceiro"; feminino e plural opcionais. */
export function ordinalWord(value: number, feminine = false, plural = false): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 1000) return String(value);
  const parts = [
    ORDINAL_HUNDREDS[Math.floor(value / 100)],
    ORDINAL_TENS[Math.floor((value % 100) / 10)],
    ORDINAL_UNITS[value % 10],
  ].filter(Boolean);
  return parts
    .map((word) => {
      const gendered = feminine ? word.replace(/o$/, 'a') : word;
      return plural ? `${gendered}s` : gendered;
    })
    .join(' ');
}

const ROMAN_VALUES: Array<[string, number]> = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
];

function toRoman(value: number): string {
  let rest = value;
  let result = '';
  for (const [symbol, amount] of ROMAN_VALUES) {
    while (rest >= amount) {
      result += symbol;
      rest -= amount;
    }
  }
  return result;
}

/** Converte só numerais romanos bem formados ("XIV" sim, "IIII" ou "IL" não). */
export function romanToNumber(text: string): number | null {
  const upper = text.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) return null;
  let total = 0;
  let index = 0;
  for (const [symbol, amount] of ROMAN_VALUES) {
    while (upper.startsWith(symbol, index)) {
      total += amount;
      index += symbol.length;
    }
  }
  if (index !== upper.length || total <= 0 || total >= 4000) return null;
  return toRoman(total) === upper ? total : null;
}

/* ------------------------------------------------------ livros bíblicos */

type Gender = 'm' | 'f';

/** Abreviação (ou nome) → nome falado; o gênero vale para "primeiro/primeira". */
const BIBLE_BOOKS: Record<string, [string, Gender]> = {};

function addBooks(name: string, gender: Gender, ...abbreviations: string[]) {
  for (const abbreviation of [name, ...abbreviations]) BIBLE_BOOKS[abbreviation] = [name, gender];
}

addBooks('Gênesis', 'm', 'Gn', 'Gên', 'Gen');
addBooks('Êxodo', 'm', 'Ex', 'Êx', 'Exod');
addBooks('Levítico', 'm', 'Lv', 'Lev');
addBooks('Números', 'm', 'Nm', 'Num');
addBooks('Deuteronômio', 'm', 'Dt', 'Deut');
addBooks('Josué', 'm', 'Js', 'Jos');
addBooks('Juízes', 'm', 'Jz', 'Jui');
addBooks('Rute', 'm', 'Rt');
addBooks('Samuel', 'm', 'Sm', 'Sam');
addBooks('Reis', 'm', 'Rs', 'Re', 'Reg');
addBooks('Crônicas', 'm', 'Cr', 'Crôn', 'Par');
addBooks('Esdras', 'm', 'Esd');
addBooks('Neemias', 'm', 'Ne', 'Ne');
addBooks('Tobias', 'm', 'Tb', 'Tob');
addBooks('Judite', 'm', 'Jt', 'Jdt');
addBooks('Ester', 'm', 'Est');
addBooks('Macabeus', 'm', 'Mc', 'Mac');
addBooks('Jó', 'm', 'Jó', 'Job');
addBooks('Salmo', 'm', 'Sl', 'Sal', 'Ps', 'Salmos');
addBooks('Provérbios', 'm', 'Pr', 'Prov');
addBooks('Eclesiastes', 'm', 'Ecl', 'Ecle', 'Qo');
addBooks('Cântico dos Cânticos', 'm', 'Ct', 'Cant');
addBooks('Sabedoria', 'm', 'Sb', 'Sab');
addBooks('Eclesiástico', 'm', 'Eclo', 'Eccli', 'Sir');
addBooks('Isaías', 'm', 'Is', 'Isa');
addBooks('Jeremias', 'm', 'Jr', 'Jer');
addBooks('Lamentações', 'm', 'Lm', 'Lam');
addBooks('Baruc', 'm', 'Br', 'Bar');
addBooks('Ezequiel', 'm', 'Ez', 'Ezeq');
addBooks('Daniel', 'm', 'Dn', 'Dan');
addBooks('Oseias', 'm', 'Os');
addBooks('Joel', 'm', 'Jl');
addBooks('Amós', 'm', 'Am');
addBooks('Abdias', 'm', 'Ab', 'Abd');
addBooks('Jonas', 'm', 'Jn');
addBooks('Miqueias', 'm', 'Mq', 'Miq');
addBooks('Naum', 'm', 'Na');
addBooks('Habacuc', 'm', 'Hab');
addBooks('Sofonias', 'm', 'Sf', 'Sof');
addBooks('Ageu', 'm', 'Ag');
addBooks('Zacarias', 'm', 'Zc', 'Zac');
addBooks('Malaquias', 'm', 'Ml', 'Mal');
addBooks('Mateus', 'm', 'Mt', 'Mat', 'Matth');
addBooks('Marcos', 'm', 'Mc', 'Mar', 'Marc');
addBooks('Lucas', 'm', 'Lc', 'Luc');
addBooks('João', 'f', 'Jo', 'Joan');
addBooks('Atos dos Apóstolos', 'm', 'At', 'Act', 'Atos');
addBooks('Romanos', 'm', 'Rm', 'Rom');
addBooks('Coríntios', 'f', 'Cor', 'Co');
addBooks('Gálatas', 'm', 'Gl', 'Gal', 'Ga');
addBooks('Efésios', 'm', 'Ef', 'Eph');
addBooks('Filipenses', 'm', 'Fl', 'Fp', 'Fil', 'Phil');
addBooks('Colossenses', 'm', 'Cl', 'Col');
addBooks('Tessalonicenses', 'f', 'Ts', 'Tes', 'Thess');
addBooks('Timóteo', 'f', 'Tm', 'Tim');
addBooks('Tito', 'm', 'Tt', 'Tit');
addBooks('Filêmon', 'm', 'Fm', 'Flm');
addBooks('Hebreus', 'm', 'Hb', 'Heb', 'Hebr');
addBooks('Tiago', 'm', 'Tg', 'Jac');
addBooks('Pedro', 'f', 'Pd', 'Pe', 'Pet', 'Petr');
addBooks('Judas', 'm', 'Jd');
addBooks('Apocalipse', 'm', 'Ap', 'Apoc');

// Ajustes para livros numerados: "1 Jo" é a primeira carta de João (feminino),
// mas "Jo 3,16" sozinho é o Evangelho. "1 Sm", "2 Rs" etc. são masculinos.
const NUMBERED_FEMININE = new Set(['Coríntios', 'Tessalonicenses', 'Timóteo', 'Pedro', 'João']);
// "Mc" sem número é Marcos; com número é Macabeus.
const NUMBERED_OVERRIDES: Record<string, string> = { Mc: 'Macabeus', Pe: 'Pedro', Re: 'Reis' };

const bookPattern = Object.keys(BIBLE_BOOKS)
  .sort((a, b) => b.length - a.length)
  .map((key) => key.replace(/\s+/g, '\\s+'))
  .join('|');

// [prefixo 1-3] Livro[.] capítulo , versículo [- versículo] [. versículo [- versículo]]
const BIBLE_REFERENCE = new RegExp(
  `(?<![\\p{L}\\d])(?:([1-3])\\s?)?(${bookPattern})\\.?\\s?(\\d{1,3})\\s?[,:]\\s?(\\d{1,3})(?:\\s?[-–]\\s?(\\d{1,3}))?((?:\\.\\d{1,3}(?:[-–]\\d{1,3})?)*)(?![\\d])`,
  'gu',
);

function verses(first: string, last?: string): string {
  return last ? `versículos ${first} a ${last}` : `versículo ${first}`;
}

function expandBibleReferences(text: string): string {
  return text.replace(
    BIBLE_REFERENCE,
    (match, prefix: string | undefined, rawBook: string, chapter: string, verse: string, verseEnd?: string, more?: string) => {
      const key = rawBook.replace(/\s+/g, ' ');
      const entry = BIBLE_BOOKS[key];
      if (!entry) return match;
      let [name] = entry;
      if (prefix && NUMBERED_OVERRIDES[key]) name = NUMBERED_OVERRIDES[key];
      // "Sm", "Rs", "Cr", "Mac", "Cor", "Tm"... sem número não fazem sentido; "Jo" sem número é o Evangelho.
      const spokenBook = prefix
        ? `${ordinalWord(Number(prefix), NUMBERED_FEMININE.has(name))} ${name}`
        : name;
      const isPsalm = name === 'Salmo';
      let spoken = isPsalm
        ? `${spokenBook} ${chapter}, ${verses(verse, verseEnd)}`
        : `${spokenBook}, capítulo ${chapter}, ${verses(verse, verseEnd)}`;
      if (more) {
        const extra = Array.from(more.matchAll(/(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?/g)).map((part) =>
          part[2] ? `${part[1]} a ${part[2]}` : part[1],
        );
        if (extra.length) spoken += ` e ${extra.join(' e ')}`;
      }
      return spoken;
    },
  );
}

/* --------------------------------------------------------- abreviações */

// Antes de nome próprio.
const TITLES: Array<[RegExp, string]> = [
  [/(?<![\p{L}])Revm[oa]\.\s?/gu, 'Reverendíssimo '],
  [/(?<![\p{L}])Rev(?:do)?\.\s?(?=\p{Lu})/gu, 'Reverendo '],
  [/(?<![\p{L}])Pe\.\s?(?=\p{Lu})/gu, 'Padre '],
  [/(?<![\p{L}])Fr\.\s?(?=\p{Lu})/gu, 'Frei '],
  [/(?<![\p{L}])Mons\.\s?(?=\p{Lu})/gu, 'Monsenhor '],
  [/(?<![\p{L}])Card\.\s?(?=\p{Lu})/gu, 'Cardeal '],
  [/(?<![\p{L}])Sto\.\s?(?=\p{Lu})/gu, 'Santo '],
  [/(?<![\p{L}])Sta\.\s?(?=\p{Lu})/gu, 'Santa '],
  [/(?<![\p{L}])Exm[oa]\.\s?/gu, 'Excelentíssimo '],
  [/(?<![\p{L}])Sr\.ª|Sra\.\s?(?=\p{Lu})/gu, 'Senhora '],
  [/(?<![\p{L}])Sr\.\s?(?=\p{Lu})/gu, 'Senhor '],
  [/(?<![\p{L}])Dra\.\s?(?=\p{Lu})/gu, 'Doutora '],
  [/(?<![\p{L}])Dr\.\s?(?=\p{Lu})/gu, 'Doutor '],
  [/(?<![\p{L}])Prof(?:a)?\.\s?(?=\p{Lu})/gu, 'Professor '],
];

// Sempre que aparecem assim.
const FIXED: Array<[RegExp, string]> = [
  [/(?<![\p{L}])N\.\s?S\.\s?J\.\s?C\./gu, 'Nosso Senhor Jesus Cristo'],
  [/(?<![\p{L}])N\.\s?Sr\.?ª|(?<![\p{L}])N\.\s?Sra\.|(?<![\p{L}])N\.\s?Senhora/gu, 'Nossa Senhora'],
  [/(?<![\p{L}])N\.\s?S\.(?=\s)/gu, 'Nosso Senhor'],
  [/(?<![\p{L}])B\.\s?M\.\s?V\.|(?<![\p{L}])B\.\s?V\.\s?M\./gu, 'Bem-aventurada Virgem Maria'],
  [/(?<![\p{L}])[Cc]fr?\.\s?/gu, 'conforme '],
  [/(?<![\p{L}])op\.\s?cit\./gu, 'obra citada'],
  [/(?<![\p{L}])[Ii]bid(?:em)?\./gu, 'no mesmo lugar'],
  [/(?<![\p{L}])i\.\s?e\./gu, 'isto é'],
  [/(?<![\p{L}])[Ee]x\.:\s?/gu, 'por exemplo: '],
  [/(?<![\p{L}])a\.\s?C\./gu, 'antes de Cristo'],
  [/(?<![\p{L}])d\.\s?C\./gu, 'depois de Cristo'],
  [/(?<![\p{L}])etc\.(?=\s+[\p{Lu}“"«]|\s*$)/gu, 'etcétera.'],
  [/(?<![\p{L}])etc\./gu, 'etcétera'],
  [/(?<![\p{L}])[Oo]bs\.\s?/gu, 'Observação: '],
];

// Antes de número.
const BEFORE_NUMBER: Array<[RegExp, string]> = [
  [/(?<![\p{L}])(?:[Nn]\.?\s?[º°]|[Nn]\.)\s?(?=\d)/gu, 'número '],
  [/(?<![\p{L}])nn\.\s?(?=\d)/gu, 'números '],
  [/(?<![\p{L}])pp\.\s?(?=\d)/gu, 'páginas '],
  [/(?<![\p{L}])(?:p|pág)\.\s?(?=\d)/gu, 'página '],
  [/(?<![\p{L}])caps\.\s?(?=\d)/gu, 'capítulos '],
  [/(?<![\p{L}])(?:cap|c)\.\s?(?=\d)/gu, 'capítulo '],
  [/(?<![\p{L}])vv\.\s?(?=\d)/gu, 'versículos '],
  [/(?<![\p{L}])v\.\s?(?=\d)/gu, 'versículo '],
  [/(?<![\p{L}])vol\.\s?(?=\d)/gu, 'volume '],
  [/(?<![\p{L}])t\.\s?(?=\d)/gu, 'tomo '],
  [/(?<![\p{L}])art\.\s?(?=\d)/gu, 'artigo '],
  [/§§\s?/gu, 'parágrafos '],
  [/§\s?/gu, 'parágrafo '],
];

const MALE_A_NAMES = new Set(['Boaventura', 'Ventura', 'Bonaventura', 'Luca', 'Elias', 'Matias', 'Tobias']);

/** "S. Agostinho" → Santo; "S. Bernardo" → São; "S. Teresa" → Santa. */
function expandSaint(text: string): string {
  return text.replace(/(?<![\p{L}.])S\.\s?(?=(\p{Lu}[\p{Ll}]+))/gu, (_match, name: string) => {
    if (/a$/.test(name) && !MALE_A_NAMES.has(name)) return 'Santa ';
    if (/^(?:[AEIOUÁÉÍÓÚÂÊÔ]|H[aeiou])/u.test(name) && name !== 'Hilário') return 'Santo ';
    if (name === 'Tomás' || name === 'Hilário') return 'Santo ';
    return 'São ';
  });
}

function expandAbbreviations(text: string): string {
  let result = text;
  for (const [pattern, replacement] of [...FIXED, ...TITLES, ...BEFORE_NUMBER]) {
    result = result.replace(pattern, replacement);
  }
  return expandSaint(result);
}

/* ------------------------------------------------------------- romanos */

const ROMAN_KEYWORDS =
  'parte|partes|cap[ií]tulo|cap|livro|tomo|volume|vol|se[cç][aã]o|t[ií]tulo|artigo|art|s[eé]culo|sec|s[eé]c|ano|li[cç][aã]o|lect|salmo|c[aâ]ntico|canto|ato|cena|ap[eê]ndice|anexo|n[uú]mero|semana|domingo|moradas?|tratado|discurso|sermão|carta|epístola|pte|quest[aã]o|q';

const REGNAL_NAMES =
  'Pio|João|Paulo|Leão|Bento|Gregório|Clemente|Inocêncio|Urbano|Luís|Pedro|Henrique|Carlos|Filipe|Felipe|Fernando|Afonso|Manuel|Sisto|Alexandre|Júlio|Martinho|Nicolau|Adriano|Bonifácio|Eugênio|Estêvão|Félix|Calisto|Honório|Jaime|Eduardo|Jorge|Guilherme|Isabel|Maria|Napoleão|Vaticano|Latrão|Constantinopla|Niceia|Lião|Lyon|Constança|Viena';

const ROMAN_AFTER_KEYWORD = new RegExp(
  `(?<![\\p{L}])(${ROMAN_KEYWORDS})(\\.?\\s+)([IVXLCDM]{1,7})(?![\\p{L}\\d])`,
  'giu',
);
const ROMAN_AFTER_NAME = new RegExp(`(?<![\\p{L}])(${REGNAL_NAMES})(\\s+)([IVXLCDM]{1,7})(?![\\p{L}\\d])`, 'gu');

/** Letra única só vale como romano se for I, V ou X ("João D." não é "João 500"). */
function validNumeral(numeral: string): number | null {
  if (numeral.length === 1 && !/^[IVX]$/.test(numeral)) return null;
  if (numeral !== numeral.toUpperCase()) return null;
  return romanToNumber(numeral);
}

function expandRoman(text: string): string {
  return text
    .replace(ROMAN_AFTER_NAME, (match, name: string, space: string, numeral: string) => {
      const value = validNumeral(numeral);
      if (!value) return match;
      // Papas, reis e concílios: "João Paulo segundo", "Pio doze" (ordinal só até dez).
      const spoken = value <= 10 ? ordinalWord(value, name === 'Isabel' || name === 'Maria') : String(value);
      return `${name}${space}${spoken}`;
    })
    .replace(ROMAN_AFTER_KEYWORD, (match, keyword: string, space: string, numeral: string) => {
      const value = validNumeral(numeral);
      if (!value) return match;
      return `${keyword}${space}${value}`;
    });
}

/* ------------------------------------------------------------ ordinais */

function expandOrdinals(text: string): string {
  return text
    .replace(/(?<![\d,.])(\d{1,3})\.?\s?([ªº°])(s?)(?![\p{L}])/gu, (_m, digits: string, mark: string, plural: string) =>
      ordinalWord(Number(digits), mark === 'ª', plural === 's'),
    )
    .replace(/(?<![\d,.])(\d{1,2}) (as|os) (?=\p{Lu})/gu, (_m, digits: string, ending: string) =>
      `${ordinalWord(Number(digits), ending === 'as', true)} `,
    );
}

/* ---------------------------------------------------------- intervalos */

function expandRanges(text: string): string {
  return text.replace(/(?<![\d.,\-–/])(\d{1,4})\s?[-–]\s?(\d{1,4})(?![\d.,\-–/])/g, (match, first: string, second: string) =>
    Number(second) > Number(first) ? `${first} a ${second}` : match,
  );
}

/* ---------------------------------------------------- caixa alta (CAPS) */

function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

/** "POUCAS COISAS" → "Poucas coisas"; siglas curtas soltas (CNBB) ficam como estão. */
function softenCaps(text: string): string {
  return text
    .replace(/(?<![\p{L}])\p{Lu}{2,}(?:[ \t]+\p{Lu}{2,})+(?![\p{L}])/gu, (match) => sentenceCase(match))
    .replace(/(?<![\p{L}])\p{Lu}{5,}(?![\p{L}])/gu, (match) =>
      /^[IVXLCDM]+$/.test(match) ? match : sentenceCase(match),
    );
}

/* ---------------------------------------------------- estrutura da linha */

// Compostos que mantêm o hífen mesmo partidos no fim da linha ("bem-\naventurado").
const HYPHEN_PREFIXES = new Set(['bem', 'recém', 'além', 'aquém', 'vice', 'grão', 'grã']);
const WEEKDAYS = new Set(['segunda', 'terça', 'quarta', 'quinta', 'sexta']);

const VERB_ENDING = /(?:ndo|ou|eu|iu|am|em|ei|ai|ui|ar|er|ir|ão|õe|ões|ste|ais|eis)$/u;
// Substantivos comuns que parecem verbo + pronome quando partidos: "ser-\nvos" é "servos".
const NOT_ENCLISIS = new Set(['servos', 'servo', 'dever', 'devem']);

/**
 * "dando-\nlhe" é ênclise e mantém o hífen; "Cris-\nto" e "rei-\nno" são
 * palavras partidas e se juntam. Decide pelo pronome e pela terminação verbal.
 */
function keepsHyphen(left: string, right: string): boolean {
  const lowerLeft = left.toLocaleLowerCase('pt-BR');
  const lowerRight = right.toLocaleLowerCase('pt-BR');
  if (HYPHEN_PREFIXES.has(lowerLeft)) return true;
  if (WEEKDAYS.has(lowerLeft)) return lowerRight.startsWith('feira');
  if (NOT_ENCLISIS.has(lowerLeft + lowerRight)) return false;
  // Mesóclise: "tornar-se-\não", "dar-lhe-\ei".
  if (/^(?:se|me|te|lhe|lhes|nos|vos|lo|la|los|las)$/.test(lowerLeft)) {
    return /^(?:ei|ás|á|emos|eis|ão|ia|ias|íamos|íeis|iam)$/.test(lowerRight);
  }
  const isPronoun = /^(?:me|te|se|lhe|lhes|nos|vos|o|a|os|as|lo|la|los|las|no|na|nas)$/.test(lowerRight);
  // Vogal acentuada no fim é verbo: "Dê-nos", "dá-lhe", "fazê-lo".
  if (isPronoun && /[áéêíóô]$/u.test(lowerLeft)) return true;
  if (lowerLeft.length < 3) return false;
  // "sente-se", "parece-me", "empenhe-se"; "nos" só depois de terminação verbal
  // ("parece-nos", "prove-nos"), para não quebrar "peque-nos" (pequenos).
  if (/e$/u.test(lowerLeft) && /^(?:se|me|lhe|lhes|vos)$/.test(lowerRight)) return true;
  if (/(?:ce|de|ve|re|be)$/u.test(lowerLeft) && lowerRight === 'nos') return true;
  // "arriscamo-nos": primeira pessoa do plural perde o "s".
  if (/mo$/u.test(lowerLeft) && lowerRight === 'nos') return true;
  if (/^(?:lo|la|los|las)$/.test(lowerRight)) return /r$/u.test(lowerLeft);
  if (/^(?:no|na|nas)$/.test(lowerRight)) return /(?:m|ão|õe|ões)$/u.test(lowerLeft);
  if (/^(?:me|te|se|lhe|lhes|nos|vos|o|a|os|as)$/.test(lowerRight)) return VERB_ENDING.test(lowerLeft);
  return false;
}

/** Junta palavras partidas no fim da linha, mantendo o hífen de "dando-lhe" e "bem-aventurado". */
function joinLineBreakHyphens(text: string): string {
  return text.replace(/(\p{L}+)-[ \t]*\n[ \t]*(\p{Ll}[\p{L}]*)/gu, (_m, left: string, right: string) =>
    keepsHyphen(left, right) ? `${left}-${right}` : left + right,
  ).replace(/(\d)\s?[-–]\s*\n\s*(\d)/g, '$1-$2');
}

// Livros numerados: "1 Reis" no começo da linha não é número de parágrafo.
const NUMBERED_BOOK_START = /^(?:Reis|Samuel|Sm|Rs|Cr|Crônicas|Macabeus|Mac|Mc|Coríntios|Cor|Tessalonicenses|Ts|Timóteo|Tm|Tim|Pedro|Pd|Pe|João|Jo)\b/u;

/** Tira o número de parágrafo do começo da linha: "19. Se examinarmos" → "Se examinarmos". */
function dropParagraphNumbers(text: string): string {
  return text
    .replace(/\n[ \t]*\d{1,3}[.)]?[ \t]*$/u, '')
    .replace(/(^|\n)([ \t]*)(\d{1,3})(?:[.)]|\s)[ \t]*(?=[\p{Lu}“"«(—–]|[1-3]\s?\p{Lu})/gu, (match, start: string, _space, _n, offset: number) => {
    const after = text.slice(offset + match.length);
    if (Number(_n) <= 3 && NUMBERED_BOOK_START.test(after)) return match;
    return start;
  });
}

/** Linha curta sem pontuação seguida de outra linha: é título, ganha uma pausa. */
function markHeadings(text: string): string {
  const lines = text.split('\n');
  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || index === lines.length - 1) return line;
      const next = lines[index + 1]?.trim() ?? '';
      const endsOpen = !/[.!?…:;,—–\-"”’»)]$/.test(trimmed);
      const shortLine = trimmed.length <= 48;
      const isCaps = /\p{Lu}{3,}/u.test(trimmed) && trimmed === trimmed.toLocaleUpperCase('pt-BR');
      const nextStarts = /^[\p{Lu}\d“"«(]/u.test(next);
      if (endsOpen && nextStarts && (shortLine || isCaps)) return `${line}.`;
      return line;
    })
    .join('\n');
}

/* --------------------------------------------------------- função principal */

/**
 * Converte o texto de um trecho da página no que a voz deve falar.
 * Recebe o texto com quebras de linha originais (usadas para achar títulos,
 * números de parágrafo e palavras hifenizadas) e devolve uma linha só.
 */
export function prepareSpeech(raw: string): string {
  let text = raw
    // Números de nota (sobrescritos) e marcas editoriais.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, '')
    .replace(/\[\d{1,3}\]/g, '')
    .replace(/[*†‡]+(?=[\s.,;:!?)]|$)/g, '')
    .replace(/(?<![\p{L}])(?:[VR]\/|℣|℟)\s?/gu, '');

  text = joinLineBreakHyphens(text);
  text = dropParagraphNumbers(text);
  text = markHeadings(text);

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\s?\[(?:\.\.\.|…)\]|\s?\((?:\.\.\.|…)\)/g, '…')
    .replace(/[.,;:]…/g, '…')
    .replace(/\[([^\]\d]{1,40})\]/g, '$1');

  text = expandBibleReferences(text);
  text = expandRoman(text);
  text = expandAbbreviations(text);
  text = expandOrdinals(text);
  text = expandRanges(text);
  text = softenCaps(text);

  return text
    .replace(/&/g, ' e ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([.!?…])\.+/g, '$1')
    .replace(/,\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Palavras que terminam com ponto mas não encerram a frase. */
export function endsWithAbbreviation(textBeforePeriod: string): boolean {
  const word = /([\p{L}]+)$/u.exec(textBeforePeriod)?.[1];
  if (!word) return false;
  if (word.length === 1) return true;
  return /^(?:cf|cfr|pe|fr|sto|sta|sr|sra|dr|dra|prof|profa|rev|revdo|revmo|mons|card|exmo|exma|n|nn|p|pp|pág|cap|caps|vol|art|séc|sec|op|cit|ibid|etc|ex|obs|vv|v|t|ed|lect|pte)$/iu.test(word);
}
