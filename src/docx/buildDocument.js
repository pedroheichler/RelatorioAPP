/**
 * buildDocument.js
 *
 * Monta o .docx: cabeçalho (logo + clínica), corpo (seções) e rodapé
 * (assinatura + registro profissional + numeração de páginas).
 */

const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Header, Footer, AlignmentType, BorderStyle,
  WidthType, Table, TableRow, TableCell,
  ShadingType, PageNumber,
} = require('docx');
const fs = require('fs');

const { toParagraphs, toText } = require('./format');
const { scaledSize } = require('./image');

const VERDE = '1A5C4E';
const VERDE_CLARO = 'EAF2EF';
const TINTA = '1A1A1A';
const CINZA = '666666';

// Caixas máximas (em px) — a proporção real da imagem é preservada dentro delas
const LOGO_BOX = { width: 150, height: 70 };
const SIGNATURE_BOX = { width: 170, height: 60 };

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function spacer(size = 120) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [] });
}

function divider(color = VERDE) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } },
    spacing: { before: 0, after: 0 },
    children: [],
  });
}

function heading(text, level = 1, color = TINTA) {
  const sizes = { 1: 28, 2: 24, 3: 22 };
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    keepNext: true, // não deixa um título órfão no fim da página
    children: [new TextRun({
      text: toText(text),
      bold: true,
      size: sizes[level] || 22,
      color,
      font: 'Arial',
    })],
  });
}

function bodyText(text, options = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 120 },
    alignment: options.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({
      text: toText(text),
      size: 22,
      font: 'Arial',
      color: options.color || TINTA,
      bold: options.bold || false,
      italics: options.italic || false,
    })],
  });
}

function centered(text, { size = 20, bold = false, color = TINTA } = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: toText(text), size, bold, color, font: 'Arial' })],
  });
}

function labelValue(label, value) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: `${toText(label)}: `, bold: true, size: 22, font: 'Arial', color: VERDE }),
      new TextRun({ text: toText(value) || '—', size: 22, font: 'Arial', color: TINTA }),
    ],
  });
}

function buildDataTable(fields, tableWidth = 9026) {
  const colLabel = Math.round(tableWidth * 0.35);
  const colValue = tableWidth - colLabel;
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [colLabel, colValue],
    rows: fields.map((field) => new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: colLabel, type: WidthType.DXA },
          shading: { fill: VERDE_CLARO, type: ShadingType.CLEAR },
          margins,
          children: [new Paragraph({
            children: [new TextRun({ text: toText(field.label), bold: true, size: 20, font: 'Arial', color: VERDE })],
          })],
        }),
        new TableCell({
          borders,
          width: { size: colValue, type: WidthType.DXA },
          margins,
          children: [new Paragraph({
            children: [new TextRun({ text: toText(field.value) || '—', size: 20, font: 'Arial', color: TINTA })],
          })],
        }),
      ],
    })),
  });
}

function loadImage(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return null;
  return fs.readFileSync(imagePath);
}

/**
 * Parágrafo com a imagem já ajustada à caixa, sem distorção.
 * Retorna null quando não há imagem utilizável.
 */
function imageParagraph(data, box, altText) {
  if (!data || !data.length) return null;

  const { width, height, format } = scaledSize(data, box.width, box.height);

  // docx@8.5 grava toda mídia como `.png` (ImageRun não aceita `type`), então
  // um JPEG aqui vira um pacote não-conforme. O frontend converte para PNG
  // antes de enviar; isto cobre quem chama a API JSON direto.
  if (format && format !== 'png') {
    console.warn(`[docx] imagem em ${format}: será declarada como PNG no pacote. Envie PNG para máxima compatibilidade.`);
  }

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data,
      transformation: { width, height },
      altText: altText ? { title: altText, description: altText, name: altText } : undefined,
    })],
  });
}

// ─────────────────────────────────────────────
// Cabeçalho e rodapé
// ─────────────────────────────────────────────

function buildHeader(clinic) {
  const children = [];

  const logo = imageParagraph(
    clinic.logoBuffer || loadImage(clinic.logoPath),
    LOGO_BOX,
    'Logotipo da clínica',
  );
  if (logo) children.push(logo);

  if (toText(clinic.name)) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: toText(clinic.name), bold: true, size: 24, font: 'Arial', color: VERDE })],
    }));
  }

  if (toText(clinic.subtitle)) {
    children.push(centered(clinic.subtitle, { size: 18, color: CINZA }));
  }

  children.push(divider());
  return new Header({ children });
}

function buildFooter(professional) {
  const children = [divider(), spacer(80)];

  const signature = imageParagraph(
    professional.signatureBuffer || loadImage(professional.signaturePath),
    SIGNATURE_BOX,
    'Assinatura do profissional',
  );
  if (signature) children.push(signature);

  if (toText(professional.name)) {
    children.push(centered(professional.name, { size: 20, bold: true }));
  }
  if (toText(professional.title)) {
    children.push(centered(professional.title, { size: 18, color: CINZA }));
  }
  if (toText(professional.registry)) {
    children.push(centered(professional.registry, { size: 18, color: CINZA }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [new TextRun({
      children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
      size: 16,
      font: 'Arial',
      color: '999999',
    })],
  }));

  return new Footer({ children });
}

// ─────────────────────────────────────────────
// Corpo
// ─────────────────────────────────────────────

function renderSections(sections) {
  const children = [];

  for (const section of sections) {
    switch (section.type) {
      case 'title':
        children.push(heading(section.text, 1, VERDE));
        children.push(spacer(60));
        break;

      case 'subtitle':
        children.push(heading(section.text, 2, '444444'));
        break;

      case 'patient_data': {
        const rows = (section.fields || []).filter((field) => toText(field.value));
        if (rows.length) {
          children.push(heading('Dados do Paciente', 2, VERDE));
          children.push(buildDataTable(rows));
          children.push(spacer(160));
        }
        break;
      }

      case 'section_heading':
        children.push(spacer(120));
        children.push(heading(section.text, 2, VERDE));
        children.push(divider('AAAAAA'));
        children.push(spacer(80));
        break;

      case 'text': {
        // toParagraphs limpa markdown residual e descarta linhas vazias — antes,
        // cada "\n\n" da IA virava um parágrafo em branco no documento.
        const paragraphs = toParagraphs(section.content);
        if (paragraphs.length === 0) {
          children.push(bodyText('Não registrado.', { italic: true, color: CINZA }));
        } else {
          for (const paragraph of paragraphs) children.push(bodyText(paragraph));
        }
        break;
      }

      case 'label_value':
        children.push(labelValue(section.label, section.value));
        break;

      case 'spacer':
        children.push(spacer(section.size || 120));
        break;

      default:
        break;
    }
  }

  return children;
}

// ─────────────────────────────────────────────
// Builder principal
// ─────────────────────────────────────────────

/**
 * buildDocument(config) → Buffer
 *
 * config = {
 *   clinic:       { name, subtitle, logoBuffer? | logoPath? },
 *   professional: { name, title, registry, signatureBuffer? | signaturePath? },
 *   sections:     [ ...objetos de seção ],
 *   title:        string (metadado do arquivo)
 * }
 */
async function buildDocument(config) {
  const { clinic = {}, professional = {}, sections = [], title = 'Documento' } = config;

  const doc = new Document({
    title,
    creator: toText(professional.name) || 'RelatorioAPP',
    description: 'Documento gerado com RelatorioAPP',
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1800, left: 1440 },
        },
      },
      headers: { default: buildHeader(clinic) },
      footers: { default: buildFooter(professional) },
      children: [
        spacer(200),
        ...renderSections(sections),
        spacer(400),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocument, renderSections };
