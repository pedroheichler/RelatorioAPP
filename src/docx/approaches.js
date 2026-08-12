/**
 * approaches.js
 *
 * Abordagem teórica / especialidade do profissional.
 *
 * Por que existe: um relatório de psicanalista, de terapeuta TCC e de
 * fonoaudiólogo não se parecem em nada — mudam o vocabulário, o que se
 * descreve e até o que se considera relevante registrar. O prompt genérico
 * produzia um texto correto e sem identidade, com cara de IA. Cada abordagem
 * abaixo injeta o vocabulário e o foco daquela prática.
 */

const APPROACHES = {
  generico: {
    label: 'Geral / não especificar',
    guidance: null,
  },

  tcc: {
    label: 'Psicologia — TCC',
    guidance: 'Descreva o material em termos de situações-gatilho, pensamentos automáticos, emoções, respostas comportamentais e consequências. Use vocabulário da TCC (reestruturação cognitiva, crenças centrais, registro de pensamentos, exposição, tarefas entre sessões). Conduta e metas devem ser observáveis e mensuráveis.',
  },

  psicanalise: {
    label: 'Psicologia — Psicanálise',
    guidance: 'Privilegie o discurso do paciente, o processo associativo, repetições, conteúdos latentes e manifestações transferenciais. Descreva o processo, não protocolos: evite linguagem de metas, escalas e tarefas. Prefira "o paciente associou", "emergiu no discurso", "manifestou-se na transferência".',
  },

  humanista: {
    label: 'Psicologia — Humanista / ACP',
    guidance: 'Centre o registro na experiência subjetiva do paciente, no vínculo terapêutico e no processo de autoconhecimento. Use linguagem fenomenológica e não patologizante. Evite linguagem de protocolo, metas numéricas e classificação diagnóstica.',
  },

  aba: {
    label: 'Análise do Comportamento / ABA',
    guidance: 'Descreva comportamentos em termos operacionais e observáveis, com antecedentes, resposta e consequência. Sempre que as anotações permitirem, registre frequência, duração ou intensidade. Use vocabulário analítico-comportamental (reforçamento, esvanecimento de ajuda, generalização, manutenção, tentativas discretas).',
  },

  fonoaudiologia: {
    label: 'Fonoaudiologia',
    guidance: 'Use terminologia fonoaudiológica e organize por área quando fizer sentido: linguagem receptiva e expressiva, fonologia e articulação, motricidade orofacial, deglutição, fluência, voz e audição. Descreva desempenho e pistas/apoios necessários.',
  },

  terapia_ocupacional: {
    label: 'Terapia Ocupacional',
    guidance: 'Use terminologia de terapia ocupacional: desempenho ocupacional, atividades de vida diária (AVDs e AVDIs), processamento e integração sensorial, praxias, participação social e adaptação de ambientes e contextos.',
  },

  psicopedagogia: {
    label: 'Psicopedagogia',
    guidance: 'Foque nos processos de aprendizagem: leitura, escrita, raciocínio matemático, atenção, memória de trabalho e funções executivas. Relacione o desempenho às demandas escolares e registre adaptações e mediações que funcionaram.',
  },

  psiquiatria: {
    label: 'Psiquiatria',
    guidance: 'Organize o registro no formato de exame do estado mental quando as anotações permitirem (apresentação, humor, afeto, pensamento, senso-percepção, cognição, crítica). Registre condutas medicamentosas apenas se explicitamente informadas — nunca sugira ou infira medicação.',
  },

  nutricao: {
    label: 'Nutrição',
    guidance: 'Descreva hábitos alimentares, adesão ao plano, sinais e sintomas relatados e dados antropométricos apenas quando informados. Use linguagem técnica de nutrição clínica, sem inferir valores que não foram registrados.',
  },

  fisioterapia: {
    label: 'Fisioterapia',
    guidance: 'Descreva amplitude de movimento, força, dor, marcha, funcionalidade e tolerância ao esforço conforme registrado. Use terminologia cinesiológica e relacione os achados à funcionalidade no cotidiano.',
  },
};

const DEFAULT_APPROACH = 'generico';
const MAX_STYLE_NOTES = 600;

// Caracteres de controle (U+0000–U+001F e DEL), em escape ASCII
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");

/** Id válido ou o padrão — nunca confia no que veio do cliente. */
function normalizeApproach(id) {
  const key = typeof id === 'string' ? id.trim() : '';
  return Object.prototype.hasOwnProperty.call(APPROACHES, key) ? key : DEFAULT_APPROACH;
}

function getApproach(id) {
  return APPROACHES[normalizeApproach(id)];
}

/** Lista para o <select> do frontend. */
function listApproaches() {
  return Object.entries(APPROACHES).map(([id, { label }]) => ({ id, label }));
}

/** Instruções de estilo escritas pelo profissional, limitadas e higienizadas. */
function normalizeStyleNotes(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STYLE_NOTES);
}

module.exports = {
  APPROACHES,
  DEFAULT_APPROACH,
  MAX_STYLE_NOTES,
  normalizeApproach,
  getApproach,
  listApproaches,
  normalizeStyleNotes,
};
