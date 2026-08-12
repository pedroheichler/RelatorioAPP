/**
 * generateRoute.js
 *
 * GET  /api/templates  — lista os templates e seus campos
 * POST /api/preview    — gera o CONTEÚDO (JSON) para revisão, sem montar o .docx
 * POST /api/gerar-form — multipart/form-data (logo + assinatura) → .docx
 * POST /api/gerar      — JSON puro (testes / integrações) → .docx
 *
 * O fluxo do app é preview → o profissional revisa e edita → gerar. Quando
 * `content` chega no corpo, a IA NÃO é chamada de novo: o documento é montado
 * com o texto revisado. Isso evita que a versão baixada seja diferente da que
 * foi lida na tela — inaceitável num documento que leva a assinatura e o CRP
 * de alguém.
 */

const express = require('express');
const multer = require('multer');

const { getTemplate, listTemplates, buildSections, missingRequiredFields } = require('./templates');
const { generateContent } = require('./aiPrompts');
const { buildDocument } = require('./buildDocument');
const { sanitizeFilename, formatDateBR, toText } = require('./format');
const { listApproaches, normalizeApproach, normalizeStyleNotes } = require('./approaches');
const { createRateLimiter } = require('../rateLimit');

const router = express.Router();

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 20 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(Object.assign(new Error('Envie apenas arquivos de imagem.'), { statusCode: 400 }));
  },
});

// Geração custa tokens da Groq — limite mais apertado que o resto da API.
const aiLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Limite de gerações atingido. Aguarde alguns minutos antes de tentar novamente.',
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function parseJsonField(raw, fallback = {}) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Resolve o template ou lança um erro 400 já com mensagem para o usuário. */
function requireTemplate(templateId) {
  if (!toText(templateId)) {
    throw Object.assign(new Error('templateId é obrigatório.'), { statusCode: 400 });
  }
  const template = getTemplate(templateId);
  if (!template) {
    throw Object.assign(new Error(`Template "${templateId}" não encontrado.`), { statusCode: 400 });
  }
  return template;
}

/** Valida os campos obrigatórios do template — o HTML sozinho não é garantia. */
function requireFields(template, data) {
  const missing = missingRequiredFields(template, data);
  if (missing.length) {
    throw Object.assign(new Error('Campos obrigatórios ausentes.'), {
      statusCode: 400,
      userMessage: `Preencha: ${missing.join(', ')}.`,
    });
  }
}

async function fetchImageBuffer(url) {
  if (!toText(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

/** Usa só as chaves conhecidas do template e descarta o resto do que veio do cliente. */
function pickSectionContent(template, content) {
  if (!content || typeof content !== 'object') return null;

  const picked = {};
  let hasAny = false;
  for (const { key } of template.aiSections) {
    const value = toText(content[key]);
    picked[key] = value;
    if (value) hasAny = true;
  }
  return hasAny ? picked : null;
}

/**
 * Opções de geração vindas do cliente, sempre normalizadas: abordagem só pode
 * ser um id conhecido, e os textos livres são limitados antes de entrar no prompt.
 */
function generationOptions(body, professionalMeta) {
  return {
    approach: normalizeApproach(professionalMeta?.approach),
    styleNotes: normalizeStyleNotes(professionalMeta?.styleNotes),
    previousContext: toText(body?.previousContext).slice(0, 4000),
  };
}

function buildFilename(template, data) {
  const base = toText(data.patientName) || formatDateBR(data.sessionDate || data.date) || 'documento';
  const stamp = new Date().toISOString().slice(0, 10);
  return sanitizeFilename(`${template.name}_${base}_${stamp}.docx`);
}

// ─────────────────────────────────────────────
// Núcleo: monta e envia o .docx
// ─────────────────────────────────────────────

async function respondWithDocument(res, { template, data, content, clinicMeta, professionalMeta, logoBuffer, signatureBuffer, logoUrl, signatureUrl }) {
  // Prioridade: arquivo enviado > URL remota (Supabase Storage, quando existir)
  const [resolvedLogo, resolvedSignature] = await Promise.all([
    logoBuffer ? Promise.resolve(logoBuffer) : fetchImageBuffer(logoUrl),
    signatureBuffer ? Promise.resolve(signatureBuffer) : fetchImageBuffer(signatureUrl),
  ]);

  const sections = buildSections(template, data, content);

  const buffer = await buildDocument({
    title: template.title(data),
    clinic: {
      name: toText(clinicMeta?.name),
      subtitle: toText(clinicMeta?.subtitle),
      logoBuffer: resolvedLogo,
    },
    professional: {
      name: toText(professionalMeta?.name),
      title: toText(professionalMeta?.title),
      registry: toText(professionalMeta?.registry),
      signatureBuffer: resolvedSignature,
    },
    sections,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${buildFilename(template, data)}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}

// ─────────────────────────────────────────────
// Rotas
// ─────────────────────────────────────────────

router.get('/templates', (req, res) => res.json(listTemplates()));

/** Abordagens teóricas disponíveis para o <select> das configurações. */
router.get('/approaches', (req, res) => res.json(listApproaches()));

/**
 * Gera o conteúdo para a tela de revisão. Devolve as seções com rótulo e
 * texto, além do resumo formatado, para o frontend mostrar exatamente o que
 * irá para o documento.
 */
router.post('/preview', aiLimiter, async (req, res, next) => {
  try {
    const template = requireTemplate(req.body?.templateId);
    const data = parseJsonField(req.body?.data, {});
    requireFields(template, data);

    const options = generationOptions(req.body, parseJsonField(req.body?.professional, {}));
    const content = await generateContent(template, data, options);

    res.json({
      templateId: template.id,
      title: template.title(data),
      summary: template.summary(data).filter((row) => row.value),
      sections: template.aiSections.map(({ key, label }) => ({ key, label, text: content[key] || '' })),
    });
  } catch (err) {
    next(err);
  }
});

/** multipart — caminho usado pelo frontend (imagens como arquivo). */
router.post(
  '/gerar-form',
  aiLimiter,
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'signature', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const template = requireTemplate(req.body.templateId);
      const data = parseJsonField(req.body.data, {});
      requireFields(template, data);

      const professionalMeta = parseJsonField(req.body.professional, {});

      // Texto revisado na tela vence; sem ele, chama a IA.
      const content = pickSectionContent(template, parseJsonField(req.body.content, null))
        || await generateContent(template, data, generationOptions(req.body, professionalMeta));

      await respondWithDocument(res, {
        template,
        data,
        content,
        clinicMeta: parseJsonField(req.body.clinic, {}),
        professionalMeta,
        logoBuffer: req.files?.logo?.[0]?.buffer || null,
        signatureBuffer: req.files?.signature?.[0]?.buffer || null,
        logoUrl: req.body.logoUrl,
        signatureUrl: req.body.signatureUrl,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** JSON puro — integrações e testes. */
router.post('/gerar', aiLimiter, async (req, res, next) => {
  try {
    const template = requireTemplate(req.body?.templateId);
    const data = parseJsonField(req.body?.data, {});
    requireFields(template, data);

    const content = pickSectionContent(template, req.body?.content)
      || await generateContent(template, data, generationOptions(req.body, req.body?.professional));

    await respondWithDocument(res, {
      template,
      data,
      content,
      clinicMeta: req.body?.clinic,
      professionalMeta: req.body?.professional,
      logoUrl: req.body?.logoUrl,
      signatureUrl: req.body?.signatureUrl,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Tratamento de erro do router
// ─────────────────────────────────────────────

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Imagem muito grande (máximo ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`
      : 'Não foi possível processar os arquivos enviados.';
    return res.status(400).json({ error: message });
  }

  const status = err.statusCode || 500;
  if (status >= 500) console.error(`[${req.method} ${req.path}]`, err);

  return res.status(status).json({ error: err.userMessage || err.message || 'Erro inesperado.' });
});

module.exports = router;
