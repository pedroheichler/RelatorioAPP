const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Header, Footer, AlignmentType, BorderStyle,
  WidthType, HeadingLevel, Table, TableRow, TableCell,
  ShadingType, TabStopType, TabStopPosition, LevelFormat
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function spacer(size = 120) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [] });
}

function divider(color = '2E6B5E') {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } },
    spacing: { before: 0, after: 0 },
    children: []
  });
}

function heading(text, level = 1, color = '1A1A1A') {
  const sizes = { 1: 28, 2: 24, 3: 22 };
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text,
      bold: true,
      size: sizes[level] || 22,
      color,
      font: 'Arial',
    })]
  });
}

function bodyText(text, options = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    alignment: options.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({
      text: text || '',
      size: 22,
      font: 'Arial',
      color: options.color || '1A1A1A',
      bold: options.bold || false,
      italics: options.italic || false,
    })]
  });
}

function labelValue(label, value) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: 'Arial', color: '2E6B5E' }),
      new TextRun({ text: value || '—', size: 22, font: 'Arial', color: '1A1A1A' }),
    ]
  });
}

function buildDataTable(fields, tableWidth = 9026) {
  // fields = [{ label, value }, ...]
  // Renders as a 2-column table: label | value
  const colLabel = Math.round(tableWidth * 0.35);
  const colValue = tableWidth - colLabel;
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [colLabel, colValue],
    rows: fields.map(f =>
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: colLabel, type: WidthType.DXA },
            shading: { fill: 'EAF2EF', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: f.label, bold: true, size: 20, font: 'Arial', color: '1A5C4E' })]
            })]
          }),
          new TableCell({
            borders,
            width: { size: colValue, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: f.value || '—', size: 20, font: 'Arial', color: '1A1A1A' })]
            })]
          }),
        ]
      })
    )
  });
}

function loadImage(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return null;
  return fs.readFileSync(imagePath);
}

// ─────────────────────────────────────────────
// Header builder (logo + clinic name)
// ─────────────────────────────────────────────

function buildHeader(clinic) {
  const children = [];

  // Aceita buffer (upload em memória) ou caminho em disco
  const logoData = clinic.logoBuffer || loadImage(clinic.logoPath);
  const logoExt  = clinic.logoBuffer ? 'png'
    : (clinic.logoPath ? path.extname(clinic.logoPath).replace('.', '') : 'png');

  if (logoData) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        data: logoData,
        transformation: { width: 140, height: 60 },
        type: logoExt || 'png',
      })]
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: clinic.name || '', bold: true, size: 24, font: 'Arial', color: '1A5C4E' }),
    ]
  }));

  if (clinic.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: clinic.subtitle, size: 18, font: 'Arial', color: '666666' })]
    }));
  }

  children.push(divider());

  return new Header({ children });
}

// ─────────────────────────────────────────────
// Footer builder (signature + professional info)
// ─────────────────────────────────────────────

function buildFooter(professional) {
  const children = [];

  children.push(divider());
  children.push(spacer(80));

  // Aceita buffer (upload em memória) ou caminho em disco
  const signatureData = professional.signatureBuffer || loadImage(professional.signaturePath);
  const sigExt = professional.signatureBuffer ? 'png'
    : (professional.signaturePath ? path.extname(professional.signaturePath).replace('.', '') : 'png');

  if (signatureData) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        data: signatureData,
        transformation: { width: 160, height: 50 },
        type: sigExt || 'png',
      })]
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: professional.name || '', bold: true, size: 20, font: 'Arial', color: '1A1A1A' }),
    ]
  }));

  if (professional.title) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: professional.title, size: 18, font: 'Arial', color: '666666' })]
    }));
  }

  if (professional.registry) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: professional.registry, size: 18, font: 'Arial', color: '666666' })]
    }));
  }

  return new Footer({ children });
}

// ─────────────────────────────────────────────
// Section renderers (each template type)
// ─────────────────────────────────────────────

function renderSections(sections) {
  const children = [];

  for (const section of sections) {
    switch (section.type) {

      case 'title':
        children.push(heading(section.text, 1, '1A5C4E'));
        children.push(spacer(60));
        break;

      case 'subtitle':
        children.push(heading(section.text, 2, '444444'));
        break;

      case 'patient_data':
        // section.fields = [{ label, value }]
        children.push(heading('Dados do Paciente', 2, '1A5C4E'));
        children.push(buildDataTable(section.fields));
        children.push(spacer(160));
        break;

      case 'section_heading':
        children.push(spacer(120));
        children.push(heading(section.text, 2, '1A5C4E'));
        children.push(divider('AAAAAA'));
        children.push(spacer(80));
        break;

      case 'text':
        // section.content = string (may have \n for line breaks)
        const lines = (section.content || '').split('\n');
        for (const line of lines) {
          children.push(bodyText(line));
        }
        break;

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
// Main builder
// ─────────────────────────────────────────────

/**
 * buildDocument(config) → Buffer
 *
 * config = {
 *   clinic: {
 *     name, subtitle,
 *     logoPath  (absolute path to image file, optional)
 *   },
 *   professional: {
 *     name, title, registry,
 *     signaturePath (absolute path to image file, optional)
 *   },
 *   sections: [ ...section objects ]
 * }
 */
async function buildDocument(config) {
  const { clinic = {}, professional = {}, sections = [] } = config;

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1800, left: 1440 }
        }
      },
      headers: { default: buildHeader(clinic) },
      footers: { default: buildFooter(professional) },
      children: [
        spacer(200),
        ...renderSections(sections),
        spacer(400),
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { buildDocument };
