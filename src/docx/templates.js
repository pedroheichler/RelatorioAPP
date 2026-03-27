/**
 * templates.js
 *
 * Cada template define:
 * - id: identificador único
 * - name: nome exibido no app
 * - specialty: área (psicologia, fonoaudiologia, etc.) — 'all' = universal
 * - fields: campos que o usuário preenche no frontend
 * - buildSections(data): recebe os dados e retorna o array de sections para o buildDocument
 */

// ─────────────────────────────────────────────
// Relatório de Sessão
// ─────────────────────────────────────────────
const relatorioSessao = {
  id: 'relatorio_sessao',
  name: 'Relatório de Sessão',
  specialty: 'all',
  fields: [
    { key: 'patientName',    label: 'Nome do Paciente',  type: 'text' },
    { key: 'birthDate',      label: 'Data de Nascimento',type: 'date' },
    { key: 'sessionDate',    label: 'Data da Sessão',    type: 'date' },
    { key: 'sessionNumber',  label: 'Nº da Sessão',      type: 'number' },
    { key: 'modality',       label: 'Modalidade',        type: 'select', options: ['Presencial', 'Online'] },
    { key: 'notes',          label: 'Anotações da Sessão (voz ou texto)', type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title',    text: 'Relatório de Sessão' },
      { type: 'patient_data', fields: [
        { label: 'Paciente',    value: data.patientName },
        { label: 'Nascimento',  value: data.birthDate },
        { label: 'Data',        value: data.sessionDate },
        { label: 'Sessão nº',   value: data.sessionNumber },
        { label: 'Modalidade',  value: data.modality },
      ]},
      { type: 'section_heading', text: 'Queixa Principal' },
      { type: 'text', content: aiContent.queixaPrincipal },
      { type: 'section_heading', text: 'Conteúdo da Sessão' },
      { type: 'text', content: aiContent.conteudoSessao },
      { type: 'section_heading', text: 'Observações Clínicas' },
      { type: 'text', content: aiContent.observacoesClinicas },
      { type: 'section_heading', text: 'Conduta e Planejamento' },
      { type: 'text', content: aiContent.condutaPlanejamento },
    ];
  }
};

// ─────────────────────────────────────────────
// Evolução
// ─────────────────────────────────────────────
const evolucao = {
  id: 'evolucao',
  name: 'Evolução',
  specialty: 'all',
  fields: [
    { key: 'patientName',   label: 'Nome do Paciente', type: 'text' },
    { key: 'date',          label: 'Data',             type: 'date' },
    { key: 'professional',  label: 'Profissional',     type: 'text' },
    { key: 'notes',         label: 'Anotações',        type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title', text: 'Registro de Evolução' },
      { type: 'patient_data', fields: [
        { label: 'Paciente',     value: data.patientName },
        { label: 'Data',         value: data.date },
        { label: 'Profissional', value: data.professional },
      ]},
      { type: 'section_heading', text: 'Evolução' },
      { type: 'text', content: aiContent.evolucao },
      { type: 'section_heading', text: 'Conduta' },
      { type: 'text', content: aiContent.conduta },
    ];
  }
};

// ─────────────────────────────────────────────
// Solicitação / Encaminhamento
// ─────────────────────────────────────────────
const solicitacao = {
  id: 'solicitacao',
  name: 'Solicitação / Encaminhamento',
  specialty: 'all',
  fields: [
    { key: 'patientName',    label: 'Nome do Paciente',   type: 'text' },
    { key: 'birthDate',      label: 'Data de Nascimento', type: 'date' },
    { key: 'date',           label: 'Data do Documento',  type: 'date' },
    { key: 'requestType',    label: 'Tipo de Solicitação', type: 'select',
      options: ['Encaminhamento', 'Solicitação de Exame', 'Solicitação de Avaliação', 'Outro'] },
    { key: 'destination',    label: 'Encaminhar para',    type: 'text' },
    { key: 'justification',  label: 'Justificativa / Contexto clínico', type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title', text: data.requestType || 'Solicitação' },
      { type: 'patient_data', fields: [
        { label: 'Paciente',    value: data.patientName },
        { label: 'Nascimento',  value: data.birthDate },
        { label: 'Data',        value: data.date },
        { label: 'Para',        value: data.destination },
      ]},
      { type: 'section_heading', text: 'Justificativa Clínica' },
      { type: 'text', content: aiContent.justificativaClinica },
      { type: 'section_heading', text: 'Solicitação' },
      { type: 'text', content: aiContent.solicitacao },
    ];
  }
};

// ─────────────────────────────────────────────
// PTS — Plano Terapêutico Singular (autismo / neurodesenvolvimento)
// ─────────────────────────────────────────────
const pts = {
  id: 'pts',
  name: 'PTS — Plano Terapêutico Singular',
  specialty: 'all',
  fields: [
    { key: 'patientName',    label: 'Nome do Paciente',   type: 'text' },
    { key: 'birthDate',      label: 'Data de Nascimento', type: 'date' },
    { key: 'diagnosis',      label: 'Diagnóstico / CID',  type: 'text' },
    { key: 'date',           label: 'Data do PTS',        type: 'date' },
    { key: 'reviewDate',     label: 'Previsão de Revisão',type: 'date' },
    { key: 'team',           label: 'Equipe Envolvida',   type: 'text' },
    { key: 'notes',          label: 'Histórico e contexto do paciente', type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title', text: 'Plano Terapêutico Singular (PTS)' },
      { type: 'patient_data', fields: [
        { label: 'Paciente',          value: data.patientName },
        { label: 'Nascimento',        value: data.birthDate },
        { label: 'Diagnóstico / CID', value: data.diagnosis },
        { label: 'Data do PTS',       value: data.date },
        { label: 'Revisão prevista',  value: data.reviewDate },
        { label: 'Equipe',            value: data.team },
      ]},
      { type: 'section_heading', text: 'Histórico e Contexto' },
      { type: 'text', content: aiContent.historico },
      { type: 'section_heading', text: 'Objetivos Terapêuticos' },
      { type: 'text', content: aiContent.objetivos },
      { type: 'section_heading', text: 'Estratégias e Intervenções' },
      { type: 'text', content: aiContent.estrategias },
      { type: 'section_heading', text: 'Metas de Curto Prazo' },
      { type: 'text', content: aiContent.metasCurtoPrazo },
      { type: 'section_heading', text: 'Metas de Médio/Longo Prazo' },
      { type: 'text', content: aiContent.metasLongoPrazo },
      { type: 'section_heading', text: 'Orientações à Família' },
      { type: 'text', content: aiContent.orientacoesFamilia },
    ];
  }
};

// ─────────────────────────────────────────────
// Relatório do Dia (diário de bordo)
// ─────────────────────────────────────────────
const relatorioDia = {
  id: 'relatorio_dia',
  name: 'Relatório do Dia',
  specialty: 'all',
  fields: [
    { key: 'date',      label: 'Data',        type: 'date' },
    { key: 'period',    label: 'Período',     type: 'select', options: ['Manhã', 'Tarde', 'Noite', 'Dia todo'] },
    { key: 'notes',     label: 'Anotações do dia', type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title', text: 'Relatório do Dia' },
      { type: 'patient_data', fields: [
        { label: 'Data',    value: data.date },
        { label: 'Período', value: data.period },
      ]},
      { type: 'section_heading', text: 'Atividades Realizadas' },
      { type: 'text', content: aiContent.atividadesRealizadas },
      { type: 'section_heading', text: 'Observações' },
      { type: 'text', content: aiContent.observacoes },
      { type: 'section_heading', text: 'Intercorrências' },
      { type: 'text', content: aiContent.intercorrencias },
      { type: 'section_heading', text: 'Planejamento para o Próximo Dia' },
      { type: 'text', content: aiContent.planejamento },
    ];
  }
};

// ─────────────────────────────────────────────
// Relatório de Avaliação (inicial / periódica)
// ─────────────────────────────────────────────
const relatorioAvaliacao = {
  id: 'relatorio_avaliacao',
  name: 'Relatório de Avaliação',
  specialty: 'all',
  fields: [
    { key: 'patientName',  label: 'Nome do Paciente',   type: 'text' },
    { key: 'birthDate',    label: 'Data de Nascimento', type: 'date' },
    { key: 'date',         label: 'Data da Avaliação',  type: 'date' },
    { key: 'evaluationType', label: 'Tipo de Avaliação', type: 'select',
      options: ['Avaliação Inicial', 'Reavaliação', 'Avaliação de Alta'] },
    { key: 'notes',        label: 'Observações e dados coletados', type: 'textarea' },
  ],
  buildSections(data, aiContent) {
    return [
      { type: 'title', text: data.evaluationType || 'Relatório de Avaliação' },
      { type: 'patient_data', fields: [
        { label: 'Paciente',  value: data.patientName },
        { label: 'Nascimento',value: data.birthDate },
        { label: 'Data',      value: data.date },
        { label: 'Tipo',      value: data.evaluationType },
      ]},
      { type: 'section_heading', text: 'Demanda e Queixa Inicial' },
      { type: 'text', content: aiContent.demanda },
      { type: 'section_heading', text: 'Instrumentos e Procedimentos Utilizados' },
      { type: 'text', content: aiContent.instrumentos },
      { type: 'section_heading', text: 'Resultados e Análise' },
      { type: 'text', content: aiContent.resultados },
      { type: 'section_heading', text: 'Conclusão e Recomendações' },
      { type: 'text', content: aiContent.conclusao },
    ];
  }
};

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────
const TEMPLATES = {
  relatorio_sessao:    relatorioSessao,
  evolucao:            evolucao,
  solicitacao:         solicitacao,
  pts:                 pts,
  relatorio_dia:       relatorioDia,
  relatorio_avaliacao: relatorioAvaliacao,
};

function getTemplate(id) {
  return TEMPLATES[id] || null;
}

function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    specialty: t.specialty,
    fields: t.fields,
  }));
}

module.exports = { TEMPLATES, getTemplate, listTemplates };
