const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDateBR, formatDateLongBR, ageInYears, formatAge,
  parseIsoDate, toText, toParagraphs, sanitizeFilename,
} = require('../src/docx/format');

test('formatDateBR converte ISO para dd/mm/aaaa', () => {
  assert.equal(formatDateBR('2026-08-12'), '12/08/2026');
  assert.equal(formatDateBR('2026-01-05'), '05/01/2026');
});

test('formatDateBR não mexe em valor já formatado nem em vazio', () => {
  assert.equal(formatDateBR('12/08/2026'), '12/08/2026');
  assert.equal(formatDateBR(''), '');
  assert.equal(formatDateBR(null), '');
  assert.equal(formatDateBR(undefined), '');
});

test('formatDateLongBR escreve o mês por extenso', () => {
  assert.equal(formatDateLongBR('2026-08-12'), '12 de agosto de 2026');
  assert.equal(formatDateLongBR('2026-03-01'), '1 de março de 2026');
});

test('ageInYears desconta aniversário ainda não ocorrido', () => {
  assert.equal(ageInYears('2019-09-20', '2026-08-12'), 6); // aniversário em setembro
  assert.equal(ageInYears('2019-08-12', '2026-08-12'), 7); // aniversário no próprio dia
  assert.equal(ageInYears('2019-08-13', '2026-08-12'), 6);
});

test('ageInYears rejeita entrada inválida ou futura', () => {
  assert.equal(ageInYears('', '2026-08-12'), null);
  assert.equal(ageInYears('2030-01-01', '2026-08-12'), null);
  assert.equal(ageInYears('não é data', '2026-08-12'), null);
});

test('formatAge concorda o singular', () => {
  assert.equal(formatAge('2025-01-01', '2026-08-12'), '1 ano');
  assert.equal(formatAge('2020-01-01', '2026-08-12'), '6 anos');
  assert.equal(formatAge('', '2026-08-12'), '');
});

test('parseIsoDate recusa data inexistente que o Date "corrigiria"', () => {
  assert.equal(parseIsoDate('2026-02-31'), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.ok(parseIsoDate('2024-02-29')); // bissexto é válido
});

test('toText coage número e descarta objeto', () => {
  assert.equal(toText(5), '5');
  assert.equal(toText('  oi  '), 'oi');
  assert.equal(toText({ a: 1 }), '');
  assert.equal(toText(null), '');
});

test('toParagraphs limpa markdown e remove linhas vazias', () => {
  assert.deepEqual(
    toParagraphs('## Título\n\n**forte** texto\n\n\n- item'),
    ['Título', 'forte texto', '— item'],
  );
  assert.deepEqual(toParagraphs(''), []);
  assert.deepEqual(toParagraphs('   \n  \n '), []);
});

test('sanitizeFilename remove acentos e separadores de caminho', () => {
  assert.equal(sanitizeFilename('Relatório de Sessão_João.docx'), 'Relatorio_de_Sessao_Joao.docx');
  assert.equal(sanitizeFilename('../../etc/passwd'), 'etc_passwd');
  assert.equal(sanitizeFilename(''), 'documento');
});
