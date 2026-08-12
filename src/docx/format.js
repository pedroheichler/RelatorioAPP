/**
 * format.js
 *
 * Formatação de datas e texto. Sem dependências — testável isoladamente.
 *
 * Os <input type="date"> do frontend entregam ISO ("2026-08-12"). Nada disso
 * pode chegar cru no documento nem no prompt: documento clínico usa dd/mm/aaaa.
 */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

// Marcas de acentuação decompostas pelo NFD (U+0300–U+036F), em escape ASCII
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** "2026-08-12" → "12/08/2026". Valor não-ISO volta como veio. */
function formatDateBR(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  const m = raw.match(ISO_DATE);
  if (!m) return raw;
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

/** "2026-08-12" → "12 de agosto de 2026". Valor não-ISO volta como veio. */
function formatDateLongBR(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  const m = raw.match(ISO_DATE);
  if (!m) return raw;
  const [, year, month, day] = m;
  const mes = MESES[Number(month) - 1];
  if (!mes) return raw;
  return `${Number(day)} de ${mes} de ${year}`;
}

/**
 * Idade em anos completos entre duas datas ISO.
 * Retorna null se a data de nascimento faltar, for inválida ou for futura.
 */
function ageInYears(birthDate, referenceDate) {
  const birth = parseIsoDate(birthDate);
  if (!birth) return null;

  const ref = parseIsoDate(referenceDate) || new Date();
  if (ref < birth) return null;

  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** "7 anos" / "1 ano" / '' quando não dá para calcular. */
function formatAge(birthDate, referenceDate) {
  const age = ageInYears(birthDate, referenceDate);
  if (age === null) return '';
  return age === 1 ? '1 ano' : `${age} anos`;
}

/** Date em horário local (meio-dia evita o off-by-one de fuso do parse ISO). */
function parseIsoDate(value) {
  if (!value) return null;
  const m = String(value).trim().match(ISO_DATE);
  if (!m) return null;
  const [, year, month, day] = m.map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // Rejeita datas como 2026-02-31, que o Date "corrige" silenciosamente
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Coage qualquer valor para string exibível. Números viram texto; vazio vira ''. */
function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Normaliza texto vindo da IA para renderização em parágrafos.
 * Remove markdown residual (##, **, bullets), espaços em excesso e devolve
 * um array de parágrafos já sem linhas vazias.
 */
function toParagraphs(value) {
  const text = toText(value);
  if (!text) return [];

  return text
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')       // ### Título → Título
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **negrito** → negrito
    .replace(/^\s*[-*•]\s+/gm, '— ')   // bullets markdown → travessão
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Nome de arquivo seguro: sem acentos, sem separador de caminho. */
function sanitizeFilename(name) {
  return toText(name)
    .normalize('NFD').replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.]+/, '')
    .slice(0, 120) || 'documento';
}

module.exports = {
  formatDateBR,
  formatDateLongBR,
  ageInYears,
  formatAge,
  parseIsoDate,
  toText,
  toParagraphs,
  sanitizeFilename,
};
