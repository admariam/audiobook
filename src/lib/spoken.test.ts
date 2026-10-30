import { describe, expect, it } from 'vitest';
import { ordinalWord, prepareSpeech, romanToNumber } from './spoken';
import { splitIntoChunks, toSpeechText } from './text';

describe('números por extenso', () => {
  it('ordinais em gênero e número', () => {
    expect(ordinalWord(1)).toBe('primeiro');
    expect(ordinalWord(5, true, true)).toBe('quintas');
    expect(ordinalWord(23)).toBe('vigésimo terceiro');
  });

  it('só aceita romanos bem formados', () => {
    expect(romanToNumber('XIV')).toBe(14);
    expect(romanToNumber('XVIII')).toBe(18);
    expect(romanToNumber('IIII')).toBeNull();
    expect(romanToNumber('IL')).toBeNull();
  });
});

describe('o que não deve ser lido', () => {
  it('cala números de nota sobrescritos', () => {
    expect(prepareSpeech('ao parecer dos grandes letrados² que me mandaram')).toBe(
      'ao parecer dos grandes letrados que me mandaram',
    );
    expect(prepareSpeech('no Reino dos Céus”.¹ A escravidão')).toBe('no Reino dos Céus”. A escravidão');
  });

  it('tira o número de parágrafo do começo da linha', () => {
    expect(prepareSpeech('1 POUCAS COISAS, das que tenho feito')).toBe('Poucas coisas, das que tenho feito');
    expect(prepareSpeech('modelo!\n19. Se examinarmos de perto')).toBe('modelo! Se examinarmos de perto');
    expect(prepareSpeech('nosso único modelo!\n19.')).toBe('nosso único modelo!');
  });

  it('não confunde livro numerado com número de parágrafo', () => {
    expect(prepareSpeech('1 Reis 19, 12')).toBe('primeiro Reis, capítulo 19, versículo 12');
  });

  it('troca reticências entre colchetes e tira marcas de versículo e resposta', () => {
    expect(prepareSpeech('espiritual. [...] Sua argumentação')).toBe('espiritual… Sua argumentação');
    expect(prepareSpeech('V/ Enviai o vosso espírito.\nR/ E renovareis')).toBe('Enviai o vosso espírito. E renovareis');
  });
});

describe('o que é falado de outro jeito', () => {
  it('referências bíblicas', () => {
    expect(prepareSpeech('(Gen 3, 15)')).toBe('(Gênesis, capítulo 3, versículo 15)');
    expect(prepareSpeech('(Sl 58, 14-15)')).toBe('(Salmo 58, versículos 14 a 15)');
    expect(prepareSpeech('(Cf. 1 Cor 2, 9)')).toBe('(conforme primeira Coríntios, capítulo 2, versículo 9)');
    expect(prepareSpeech('Lucas 15, 16.')).toBe('Lucas, capítulo 15, versículo 16.');
    expect(prepareSpeech('Mc 1,15 e 2Mac 12,46')).toBe(
      'Marcos, capítulo 1, versículo 15 e segundo Macabeus, capítulo 12, versículo 46',
    );
  });

  it('não junta a referência da nota seguinte', () => {
    expect(prepareSpeech('Gênesis 1, 26-27.\n7 João 9, 2-3.')).toBe(
      'Gênesis, capítulo 1, versículos 26 a 27. João, capítulo 9, versículos 2 a 3.',
    );
  });

  it('abreviações', () => {
    expect(prepareSpeech('conforme S. Agostinho e S. Bernardo')).toBe('conforme Santo Agostinho e São Bernardo');
    expect(prepareSpeech('S. Teresa e S. Boaventura')).toBe('Santa Teresa e São Boaventura');
    expect(prepareSpeech('pelo Rev. Pe. Poiré')).toBe('pelo Reverendo Padre Poiré');
    expect(prepareSpeech('(n. 217)')).toBe('(número 217)');
    expect(prepareSpeech('cap. 4, § 8')).toBe('capítulo 4, parágrafo 8');
    expect(prepareSpeech('nº 12, p. 2')).toBe('número 12, página 2');
  });

  it('romanos depois de palavra-chave ou nome', () => {
    expect(prepareSpeech('Parte III')).toBe('Parte 3');
    expect(prepareSpeech('no século XVII')).toBe('no século 17');
    expect(prepareSpeech('Pio XII e João Paulo II')).toBe('Pio 12 e João Paulo segundo');
    expect(prepareSpeech('Filipe III e Luís XIV')).toBe('Filipe terceiro e Luís 14');
    expect(prepareSpeech('o Concílio Vaticano II')).toBe('o Concílio Vaticano segundo');
    // "D." depois de nome não é 500.
    expect(prepareSpeech('João D. Pedro')).toBe('João D. Pedro');
  });

  it('ordinais', () => {
    expect(prepareSpeech('nas 5ªs Moradas')).toBe('nas quintas Moradas');
    expect(prepareSpeech('1º Dia')).toBe('primeiro Dia');
    expect(prepareSpeech('nas 3 as Moradas')).toBe('nas terceiras Moradas');
  });

  it('intervalos crescentes, mas não telefones', () => {
    expect(prepareSpeech('(1673-1716)')).toBe('(1673 a 1716)');
    expect(prepareSpeech('Fone 4222-2680')).toBe('Fone 4222-2680');
  });

  it('caixa alta vira texto normal e títulos ganham pausa', () => {
    expect(prepareSpeech('PRÓLOGO\nEste tratado')).toBe('Prólogo. Este tratado');
    expect(prepareSpeech('ANTES DA COMUNHÃO')).toBe('Antes da comunhão');
  });
});

describe('hífen no fim da linha', () => {
  it('junta palavras partidas', () => {
    expect(prepareSpeech('Jesus Cris-\nto')).toBe('Jesus Cristo');
    expect(prepareSpeech('até o rei-\nno do Anticristo')).toBe('até o reino do Anticristo');
    expect(prepareSpeech('sua pró-\npria')).toBe('sua própria');
    expect(prepareSpeech('os peque-\nnos')).toBe('os pequenos');
    expect(prepareSpeech('dos ser-\nvos de Maria')).toBe('dos servos de Maria');
  });

  it('mantém o hífen de verbo com pronome e de compostos', () => {
    expect(prepareSpeech('dando-\nlhe a vida')).toBe('dando-lhe a vida');
    expect(prepareSpeech('sente-\nse')).toBe('sente-se');
    expect(prepareSpeech('Dê-\nnos')).toBe('Dê-nos');
    expect(prepareSpeech('fazê-\nlo')).toBe('fazê-lo');
    expect(prepareSpeech('tornar-se-\não')).toBe('tornar-se-ão');
    expect(prepareSpeech('bem-\naventurado')).toBe('bem-aventurado');
  });
});

describe('divisão em trechos', () => {
  it('não corta a frase depois de abreviação nem de número de parágrafo', () => {
    const text = `${'Texto de preenchimento para encher o trecho. '.repeat(3)}conforme S. Agostinho e o Pe. Poiré dizem.\n19. Se examinarmos de perto.`;
    const spoken = splitIntoChunks(text, 140).map((chunk) => toSpeechText(chunk.text));
    expect(spoken.some((part) => part.endsWith(' S.') || part.endsWith('Pe.'))).toBe(false);
    expect(spoken.join(' ')).not.toMatch(/\b19\b/);
  });
});
