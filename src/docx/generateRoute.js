/**
 * generateRoute.js
 *
 * POST /api/gerar-form  — multipart/form-data (logo + assinatura como buffer)
 * POST /api/gerar       — JSON puro (sem imagens)
 * GET  /api/templates   — lista templates disponíveis
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');

const { getTemplate, listTemplates } = require('./templates');
const { generateContent } = require('./aiPrompts');
const { buildDocument } = require('./buildDocument');

// Multer em memória — arquivos ficam em req.files como Buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas.'));
  },
});

function sanitizeFilename(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
}

async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function processRequest({ templateId, data, clinicMeta, professionalMeta, logoBuffer, signatureBuffer, logoUrl, signatureUrl, res }) {
  if (!templateId) return res.status(400).json({ error: 'templateId é obrigatório.' });

  const template = getTemplate(templateId);
  if (!template) return res.status(400).json({ error: `Template "${templateId}" não encontrado.` });

  const hasContent = data?.notes || data?.justification || data?.date || data?.patientName;
  if (!hasContent) return res.status(400).json({ error: 'Dados insuficientes para gerar o documento.' });

  // Resolve buffers: arquivo enviado direto tem prioridade; senão faz fetch da URL do Supabase
  const resolvedLogoBuffer      = logoBuffer      || await fetchImageBuffer(logoUrl);
  const resolvedSignatureBuffer = signatureBuffer || await fetchImageBuffer(signatureUrl);

  const aiContent = await generateContent(templateId, data);
  const sections  = template.buildSections(data, aiContent);

  const clinicConfig = {
    name: clinicMeta?.name || '',
    subtitle: clinicMeta?.subtitle || '',
    logoBuffer: resolvedLogoBuffer,
  };

  const professionalConfig = {
    name: professionalMeta?.name || '',
    title: professionalMeta?.title || '',
    registry: professionalMeta?.registry || '',
    signatureBuffer: resolvedSignatureBuffer,
  };

  const buffer   = await buildDocument({ clinic: clinicConfig, professional: professionalConfig, sections });
  const baseName = data?.patientName || data?.date || 'documento';
  const filename = sanitizeFilename(`${template.name}_${baseName}.docx`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

// ── multipart (React frontend) ──
router.post(
  '/gerar-form',
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'signature', maxCount: 1 }]),
  async (req, res) => {
    try {
      const templateId       = req.body.templateId;
      const data             = JSON.parse(req.body.data || '{}');
      const clinicMeta       = JSON.parse(req.body.clinic || '{}');
      const professionalMeta = JSON.parse(req.body.professional || '{}');
      const logoBuffer       = req.files?.logo?.[0]?.buffer || null;
      const signatureBuffer  = req.files?.signature?.[0]?.buffer || null;
      const logoUrl          = req.body.logoUrl || '';
      const signatureUrl     = req.body.signatureUrl || '';
      await processRequest({ templateId, data, clinicMeta, professionalMeta, logoBuffer, signatureBuffer, logoUrl, signatureUrl, res });
    } catch (err) {
      console.error('Erro /gerar-form:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }
);

// ── JSON puro (testes / integrações) ──
router.post('/gerar', async (req, res) => {
  try {
    const { templateId, data, clinic, professional } = req.body;
    await processRequest({ templateId, data, clinicMeta: clinic, professionalMeta: professional, res });
  } catch (err) {
    console.error('Erro /gerar:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.get('/templates', (req, res) => res.json(listTemplates()));

module.exports = router;
