require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');
const generateRoute = require('./src/docx/generateRoute');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas de geração de documentos
app.use('/api', generateRoute);

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Rota principal: gerar relatório ----
app.post('/api/relatorio', async (req, res) => {
  const { patientName, sessionDate, sessionNumber, modality, transcript } = req.body;

  if (!transcript || transcript.trim() === '') {
    return res.status(400).json({ error: 'Anotações da sessão são obrigatórias.' });
  }

  const dateFormatted = sessionDate
    ? new Date(sessionDate + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    : 'Data não informada';

  const prompt = `Você é assistente de uma psicóloga clínica. Com base nas anotações abaixo, gere um relatório de sessão profissional em português brasileiro.

DADOS:
- Paciente: ${patientName || 'Não informado'}
- Data: ${dateFormatted}
- Sessão nº: ${sessionNumber || '—'}
- Modalidade: ${modality || 'Presencial'}

ANOTAÇÕES DA SESSÃO:
${transcript}

INSTRUÇÕES:
- Use linguagem clínica, objetiva e respeitosa
- Organize em seções com títulos: Queixa Principal, Conteúdo da Sessão, Observações Clínicas, Conduta e Planejamento
- Não invente informações que não estão nas anotações
- Use frases em terceira pessoa (ex: "O paciente relatou...")
- Seja conciso mas completo
- Formate com títulos claros (use ### para os títulos das seções)`;

  try {
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const reportText = completion.choices[0].message.content;

    return res.json({
      success: true,
      report: reportText,
    });

  } catch (err) {
    console.error('Erro na API Groq:', err.message);
    return res.status(500).json({ error: 'Erro ao gerar relatório: ' + err.message });
  }
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dev local
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ RelatorioAPP rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
