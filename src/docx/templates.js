/**
 * templates.js
 *
 * Cada template define:
 * - id / name / specialty  → identificação ('all' = qualquer especialidade)
 * - fields[]               → campos do formulário. `required: true` é validado
 *                            no servidor, não só no HTML.
 * - aiSections[]           → { key, label }: cada item vira UMA chave no JSON
 *                            pedido à IA E UM título de seção no documento.
 *                            Fonte única da verdade — antes as duas listas
 *                            viviam separadas e saíam de sincronia.
 * - maxTokens              → orçamento de saída da IA (PTS precisa de bem mais
 *                            que uma evolução; truncar quebra o JSON).
 * - title(data)            → título do documento
 * - summary(data)          → linhas da tabela "Dados do Paciente", já formatadas
 */

const { formatDateBR, formatAge, toText } = require('./format');

// ─────────────────────────────────────────────
// Campos reutilizados
// ─────────────────────────────────────────────
const FIELD = {
  patientName: { key: 'patientName', label: 'Nome do Paciente',   type: 'text', required: true },
  birthDate:   { key: 'birthDate',   label: 'Data de Nascimento', type: 'date' },
};

/** Linha "Paciente" + "Nascimento (idade)" — repetida em quase todo documento. */
function patientRows(data, referenceDate) {
  const rows = [{ label: 'Paciente', value: toText(data.patientName) }];

  if (toText(data.birthDate)) {
    const age = formatAge(data.birthDate, referenceDate);
    rows.push({
      label: 'Nascimento',
      value: age ? `${formatDateBR(data.birthDate)} (${age})` : formatDateBR(data.birthDate),
    });
  }
  return rows;
}

// ─────────────────────────────────────────────
// Relatório de Sessão
// ─────────────────────────────────────────────
const relatorioSessao = {
  id: 'relatorio_sessao',
  name: 'Relatório de Sessão',
  specialty: 'all',
  maxTokens: 2500,
  fields: [
    FIELD.patientName,
    FIELD.birthDate,
    { key: 'sessionDate',   label: 'Data da Sessão', type: 'date', required: true },
    { key: 'sessionNumber', label: 'Nº da Sessão',   type: 'number' },
    { key: 'modality',      label: 'Modalidade',     type: 'select', options: ['Presencial', 'Online'] },
    { key: 'notes',         label: 'Anotações da Sessão', type: 'textarea', required: true,
      hint: 'Fale ou escreva livremente. A IA organiza nas seções abaixo.' },
  ],
  aiSections: [
    { key: 'queixaPrincipal',     label: 'Queixa Principal' },
    { key: 'conteudoSessao',      label: 'Conteúdo da Sessão' },
    { key: 'observacoesClinicas', label: 'Observações Clínicas' },
    { key: 'condutaPlanejamento', label: 'Conduta e Planejamento' },
  ],
  title: () => 'Relatório de Sessão',
  summary: (data) => [
    ...patientRows(data, data.sessionDate),
    { label: 'Data da sessão', value: formatDateBR(data.sessionDate) },
    { label: 'Sessão nº',      value: toText(data.sessionNumber) },
    { label: 'Modalidade',     value: toText(data.modality) },
  ],
};

// ─────────────────────────────────────────────
// Evolução
// ─────────────────────────────────────────────
const evolucao = {
  id: 'evolucao',
  name: 'Evolução',
  specialty: 'all',
  maxTokens: 1800,
  fields: [
    FIELD.patientName,
    { key: 'date',  label: 'Data',       type: 'date', required: true },
    { key: 'notes', label: 'Anotações',  type: 'textarea', required: true },
  ],
  aiSections: [
    { key: 'evolucao', label: 'Evolução' },
    { key: 'conduta',  label: 'Conduta' },
  ],
  title: () => 'Registro de Evolução',
  summary: (data) => [
    ...patientRows(data, data.date),
    { label: 'Data', value: formatDateBR(data.date) },
  ],
};

// ─────────────────────────────────────────────
// Solicitação / Encaminhamento
// ─────────────────────────────────────────────
const solicitacao = {
  id: 'solicitacao',
  name: 'Solicitação / Encaminhamento',
  specialty: 'all',
  maxTokens: 1800,
  fields: [
    FIELD.patientName,
    FIELD.birthDate,
    { key: 'date',        label: 'Data do Documento',  type: 'date', required: true },
    { key: 'requestType', label: 'Tipo de Solicitação', type: 'select', required: true,
      options: ['Encaminhamento', 'Solicitação de Exame', 'Solicitação de Avaliação', 'Outro'] },
    { key: 'destination', label: 'Encaminhar para', type: 'text',
      hint: 'Profissional, especialidade ou serviço de destino.' },
    { key: 'justification', label: 'Justificativa / Contexto clínico', type: 'textarea', required: true },
  ],
  aiSections: [
    { key: 'justificativaClinica', label: 'Justificativa Clínica' },
    { key: 'solicitacao',          label: 'Solicitação' },
  ],
  title: (data) => toText(data.requestType) || 'Solicitação',
  summary: (data) => [
    ...patientRows(data, data.date),
    { label: 'Data', value: formatDateBR(data.date) },
    { label: 'Para', value: toText(data.destination) },
  ],
};

// ─────────────────────────────────────────────
// PTS — Plano Terapêutico Singular
// ─────────────────────────────────────────────
const pts = {
  id: 'pts',
  name: 'PTS — Plano Terapêutico Singular',
  specialty: 'all',
  // 6 seções longas: o limite antigo (2000) truncava a resposta e quebrava o JSON
  maxTokens: 5000,
  fields: [
    FIELD.patientName,
    FIELD.birthDate,
    { key: 'diagnosis',  label: 'Diagnóstico / CID',   type: 'text' },
    { key: 'date',       label: 'Data do PTS',         type: 'date', required: true },
    { key: 'reviewDate', label: 'Previsão de Revisão', type: 'date' },
    { key: 'team',       label: 'Equipe Envolvida',    type: 'text' },
    { key: 'notes',      label: 'Histórico e contexto do paciente', type: 'textarea', required: true },
  ],
  aiSections: [
    { key: 'historico',          label: 'Histórico e Contexto' },
    { key: 'objetivos',          label: 'Objetivos Terapêuticos' },
    { key: 'estrategias',        label: 'Estratégias e Intervenções' },
    { key: 'metasCurtoPrazo',    label: 'Metas de Curto Prazo' },
    { key: 'metasLongoPrazo',    label: 'Metas de Médio/Longo Prazo' },
    { key: 'orientacoesFamilia', label: 'Orientações à Família' },
  ],
  title: () => 'Plano Terapêutico Singular (PTS)',
  summary: (data) => [
    ...patientRows(data, data.date),
    { label: 'Diagnóstico / CID', value: toText(data.diagnosis) },
    { label: 'Data do PTS',       value: formatDateBR(data.date) },
    { label: 'Revisão prevista',  value: formatDateBR(data.reviewDate) },
    { label: 'Equipe',            value: toText(data.team) },
  ],
};

// ─────────────────────────────────────────────
// Relatório do Dia (diário de bordo)
// ─────────────────────────────────────────────
const relatorioDia = {
  id: 'relatorio_dia',
  name: 'Relatório do Dia',
  specialty: 'all',
  maxTokens: 2500,
  fields: [
    { key: 'date',   label: 'Data',    type: 'date', required: true },
    { key: 'period', label: 'Período', type: 'select', options: ['Manhã', 'Tarde', 'Noite', 'Dia todo'] },
    { key: 'notes',  label: 'Anotações do dia', type: 'textarea', required: true },
  ],
  aiSections: [
    { key: 'atividadesRealizadas', label: 'Atividades Realizadas' },
    { key: 'observacoes',          label: 'Observações' },
    { key: 'intercorrencias',      label: 'Intercorrências' },
    { key: 'planejamento',         label: 'Planejamento para o Próximo Dia' },
  ],
  title: () => 'Relatório do Dia',
  summary: (data) => [
    { label: 'Data',    value: formatDateBR(data.date) },
    { label: 'Período', value: toText(data.period) },
  ],
};

// ─────────────────────────────────────────────
// Relatório de Avaliação
// ─────────────────────────────────────────────
const relatorioAvaliacao = {
  id: 'relatorio_avaliacao',
  name: 'Relatório de Avaliação',
  specialty: 'all',
  maxTokens: 3500,
  fields: [
    FIELD.patientName,
    FIELD.birthDate,
    { key: 'date',           label: 'Data da Avaliação', type: 'date', required: true },
    { key: 'evaluationType', label: 'Tipo de Avaliação', type: 'select', required: true,
      options: ['Avaliação Inicial', 'Reavaliação', 'Avaliação de Alta'] },
    { key: 'notes', label: 'Observações e dados coletados', type: 'textarea', required: true,
      hint: 'Inclua instrumentos aplicados, se houver — a IA não deve inventá-los.' },
  ],
  aiSections: [
    { key: 'demanda',      label: 'Demanda e Queixa Inicial' },
    { key: 'instrumentos', label: 'Instrumentos e Procedimentos Utilizados' },
    { key: 'resultados',   label: 'Resultados e Análise' },
    { key: 'conclusao',    label: 'Conclusão e Recomendações' },
  ],
  title: (data) => toText(data.evaluationType) || 'Relatório de Avaliação',
  summary: (data) => [
    ...patientRows(data, data.date),
    { label: 'Data da avaliação', value: formatDateBR(data.date) },
    { label: 'Tipo',              value: toText(data.evaluationType) },
  ],
};

// ─────────────────────────────────────────────
// Montagem das seções do documento
// ─────────────────────────────────────────────

/**
 * Monta o array de seções para o buildDocument a partir do template,
 * dos dados do formulário e do conteúdo (gerado pela IA e possivelmente
 * editado pelo profissional na tela de revisão).
 */
function buildSections(template, data, content = {}) {
  const sections = [
    { type: 'title', text: template.title(data) },
    { type: 'patient_data', fields: template.summary(data).filter((row) => row.value) },
  ];

  for (const { key, label } of template.aiSections) {
    sections.push({ type: 'section_heading', text: label });
    sections.push({ type: 'text', content: content[key] });
  }
  return sections;
}

/** Campos obrigatórios ausentes, pelos rótulos que o usuário vê. */
function missingRequiredFields(template, data = {}) {
  return template.fields
    .filter((field) => field.required && !toText(data[field.key]))
    .map((field) => field.label);
}

// ─────────────────────────────────────────────
// Registro
// ─────────────────────────────────────────────
const TEMPLATES = {
  relatorio_sessao:    relatorioSessao,
  evolucao,
  solicitacao,
  pts,
  relatorio_dia:       relatorioDia,
  relatorio_avaliacao: relatorioAvaliacao,
};

function getTemplate(id) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, id) ? TEMPLATES[id] : null;
}

/** Forma enxuta enviada ao frontend (sem funções). */
function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    specialty: t.specialty,
    fields: t.fields,
    sections: t.aiSections,
  }));
}

module.exports = { TEMPLATES, getTemplate, listTemplates, buildSections, missingRequiredFields };
