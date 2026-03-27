/**
 * aiPrompts.js
 *
 * Para cada template, define o prompt enviado ao Claude.
 * O Claude responde em JSON com as seções do documento.
 * Isso separa o conteúdo gerado do layout — o buildDocument.js
 * só monta o .docx, sem se preocupar com o que escrever.
 */

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// Prompts por template
// ─────────────────────────────────────────────

const PROMPTS = {

  relatorio_sessao: (data) => `
Você é assistente de um profissional de saúde. Gere o conteúdo de um relatório de sessão clínico em português brasileiro.

Dados da sessão:
- Paciente: ${data.patientName}
- Data: ${data.sessionDate}
- Sessão nº: ${data.sessionNumber}
- Modalidade: ${data.modality}
- Anotações: ${data.notes}

Retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown, sem backticks:
{
  "queixaPrincipal": "...",
  "conteudoSessao": "...",
  "observacoesClinicas": "...",
  "condutaPlanejamento": "..."
}

Regras:
- Linguagem clínica, objetiva, terceira pessoa ("O paciente relatou...")
- Não invente informações além do que foi fornecido
- Cada campo deve ter 2-4 parágrafos separados por \\n\\n
`,

  evolucao: (data) => `
Gere o conteúdo de um registro de evolução clínica em português brasileiro.

Dados:
- Paciente: ${data.patientName}
- Data: ${data.date}
- Profissional: ${data.professional}
- Anotações: ${data.notes}

Retorne SOMENTE JSON válido:
{
  "evolucao": "...",
  "conduta": "..."
}

Regras: linguagem clínica, terceira pessoa, conciso.
`,

  solicitacao: (data) => `
Gere o conteúdo de uma solicitação/encaminhamento clínico em português brasileiro.

Dados:
- Paciente: ${data.patientName}
- Tipo: ${data.requestType}
- Encaminhar para: ${data.destination}
- Contexto: ${data.justification}

Retorne SOMENTE JSON válido:
{
  "justificativaClinica": "...",
  "solicitacao": "..."
}

A justificativa deve ser clara e embasar a necessidade. A solicitação deve ser direta e formal.
`,

  pts: (data) => `
Gere o conteúdo de um Plano Terapêutico Singular (PTS) em português brasileiro, para área da saúde (pode ser autismo, neurodesenvolvimento, saúde mental, etc.).

Dados:
- Paciente: ${data.patientName}
- Diagnóstico/CID: ${data.diagnosis}
- Equipe: ${data.team}
- Histórico/contexto: ${data.notes}

Retorne SOMENTE JSON válido:
{
  "historico": "...",
  "objetivos": "...",
  "estrategias": "...",
  "metasCurtoPrazo": "...",
  "metasLongoPrazo": "...",
  "orientacoesFamilia": "..."
}

Seja específico, clínico e prático. Use linguagem acessível nas orientações à família.
`,

  relatorio_dia: (data) => `
Gere o conteúdo de um relatório do dia em saúde em português brasileiro.

Dados:
- Data: ${data.date}
- Período: ${data.period}
- Anotações: ${data.notes}

Retorne SOMENTE JSON válido:
{
  "atividadesRealizadas": "...",
  "observacoes": "...",
  "intercorrencias": "...",
  "planejamento": "..."
}

Se não houver intercorrências, escreva "Sem intercorrências registradas."
`,

  relatorio_avaliacao: (data) => `
Gere o conteúdo de um relatório de avaliação clínica em português brasileiro.

Dados:
- Paciente: ${data.patientName}
- Tipo: ${data.evaluationType}
- Data: ${data.date}
- Observações coletadas: ${data.notes}

Retorne SOMENTE JSON válido:
{
  "demanda": "...",
  "instrumentos": "...",
  "resultados": "...",
  "conclusao": "..."
}

Use linguagem técnica adequada. A conclusão deve incluir recomendações objetivas.
`,

};

// ─────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────

async function generateContent(templateId, data) {
  const promptFn = PROMPTS[templateId];
  if (!promptFn) throw new Error(`Template "${templateId}" não tem prompt definido.`);

  const prompt = promptFn(data);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();

  // Remove possíveis backticks caso o modelo os inclua
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Erro ao parsear JSON do Claude: ${err.message}\nResposta recebida:\n${raw}`);
  }
}

module.exports = { generateContent };
