/**
 * image.js
 *
 * Detecção de formato e dimensões por magic bytes, sem dependência nativa.
 *
 * Por que isso importa: no docx@8.5.0 o ImageRun grava a mídia com a chave
 * fixa `<id>.png` e IImageOptions nem aceita `type` — logo, o formato real
 * NÃO é declarado no pacote. Mandar um JPEG faz o .docx anunciar image/png
 * para bytes JPEG, e leitores estritos (LibreOffice, Google Docs) podem
 * recusar a imagem. O frontend converte tudo para PNG antes de enviar; aqui
 * detectamos o formato para avisar quando algo diferente chega pela API JSON.
 *
 * As dimensões servem para preservar a proporção: a versão anterior forçava
 * 140x60 e 160x50, achatando qualquer logo/assinatura fora dessa razão.
 */

/**
 * @returns {{ format: string, width: number, height: number } | null}
 */
function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  return readPng(buffer) || readJpeg(buffer) || readGif(buffer) || readBmp(buffer) || null;
}

function readPng(buf) {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!SIGNATURE.every((byte, i) => buf[i] === byte)) return null;
  // IHDR é sempre o primeiro chunk: 8 (assinatura) + 4 (len) + 4 ("IHDR")
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;

  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) { offset += 1; continue; }

    const marker = buf[offset + 1];
    // Preenchimento (0xFF) e marcadores sem payload
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }

    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;

    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 carregam as dimensões.
    // DHT (0xC4), JPG (0xC8) e DAC (0xCC) ficam de fora da faixa.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      if (offset + 9 >= buf.length) return null;
      return {
        format: 'jpeg',
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }
  return null;
}

function readGif(buf) {
  const header = buf.toString('ascii', 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function readBmp(buf) {
  if (buf.toString('ascii', 0, 2) !== 'BM' || buf.length < 26) return null;
  return {
    format: 'bmp',
    width: Math.abs(buf.readInt32LE(18)),
    height: Math.abs(buf.readInt32LE(22)),
  };
}

/**
 * Encaixa (largura, altura) dentro de uma caixa mantendo a proporção.
 * Nunca amplia — imagem menor que a caixa fica no tamanho original.
 */
function fitBox(width, height, maxWidth, maxHeight) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Dimensões finais para embutir a imagem no .docx, respeitando a proporção.
 * Buffer ilegível cai no tamanho da caixa (comportamento antigo).
 */
function scaledSize(buffer, maxWidth, maxHeight) {
  const meta = detectImage(buffer);
  if (!meta) return { width: maxWidth, height: maxHeight, format: null };
  const size = fitBox(meta.width, meta.height, maxWidth, maxHeight);
  return { ...size, format: meta.format };
}

module.exports = { detectImage, fitBox, scaledSize };
