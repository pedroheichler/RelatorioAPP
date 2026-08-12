require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const generateRoute = require('./src/docx/generateRoute');
const { MODEL } = require('./src/docx/aiPrompts');

const app = express();
const PORT = process.env.PORT || 3000;

// Atrás do proxy da Vercel — necessário para o rate limit enxergar o IP real
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

app.use('/api', generateRoute);

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    model: MODEL,
    timestamp: new Date().toISOString(),
  });
});

// ---- 404 de API (o resto cai no index.html estático) ----
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// ---- Erro genérico ----
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[erro não tratado]', err);
  return res.status(err.statusCode || 500).json({ error: err.userMessage || 'Erro interno do servidor.' });
});

// Dev local
if (require.main === module) {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY não definida — a geração de documentos vai falhar com 503.');
    console.warn('   Copie .env.example para .env e preencha a chave (console.groq.com).');
  }
  app.listen(PORT, () => {
    console.log(`✅ RelatorioAPP rodando em http://localhost:${PORT}  (modelo: ${MODEL})`);
  });
}

module.exports = app;
