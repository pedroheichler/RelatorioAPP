const test = require('node:test');
const assert = require('node:assert/strict');

const { detectImage, fitBox, scaledSize } = require('../src/docx/image');

/** PNG 4x2 mínimo: assinatura + cabeçalho IHDR (só o que detectImage lê). */
function png(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** JPEG com SOF0 declarando as dimensões. */
function jpeg(width, height) {
  const parts = [
    Buffer.from([0xff, 0xd8]),                          // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),  // APP0 curto, pulado pelo parser
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),        // SOF0
    (() => {
      const dims = Buffer.alloc(4);
      dims.writeUInt16BE(height, 0);
      dims.writeUInt16BE(width, 2);
      return dims;
    })(),
    Buffer.alloc(10),
  ];
  return Buffer.concat(parts);
}

test('detecta PNG com as dimensões corretas', () => {
  assert.deepEqual(detectImage(png(400, 120)), { format: 'png', width: 400, height: 120 });
});

test('detecta JPEG pulando segmentos até o SOF', () => {
  assert.deepEqual(detectImage(jpeg(800, 600)), { format: 'jpeg', width: 800, height: 600 });
});

test('detecta GIF e BMP', () => {
  const gif = Buffer.alloc(16);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(120, 6);
  gif.writeUInt16LE(90, 8);
  assert.deepEqual(detectImage(gif), { format: 'gif', width: 120, height: 90 });

  const bmp = Buffer.alloc(30);
  bmp.write('BM', 0, 'ascii');
  bmp.writeInt32LE(64, 18);
  bmp.writeInt32LE(-32, 22); // altura negativa = top-down, deve virar 32
  assert.deepEqual(detectImage(bmp), { format: 'bmp', width: 64, height: 32 });
});

test('devolve null para lixo ou buffer curto', () => {
  assert.equal(detectImage(Buffer.from('não sou imagem nenhuma')), null);
  assert.equal(detectImage(Buffer.alloc(4)), null);
  assert.equal(detectImage(null), null);
});

test('fitBox preserva a proporção e nunca amplia', () => {
  assert.deepEqual(fitBox(400, 200, 150, 70), { width: 140, height: 70 });
  assert.deepEqual(fitBox(200, 400, 150, 70), { width: 35, height: 70 });
  assert.deepEqual(fitBox(50, 20, 150, 70), { width: 50, height: 20 }); // menor que a caixa
});

test('scaledSize usa a caixa inteira quando o buffer é ilegível', () => {
  assert.deepEqual(scaledSize(Buffer.from('lixo'), 150, 70), { width: 150, height: 70, format: null });
});

test('scaledSize mantém proporção de um logo largo', () => {
  // Antes o código forçava 140x60 em tudo, achatando logos fora dessa razão
  assert.deepEqual(scaledSize(png(600, 150), 150, 70), { width: 150, height: 38, format: 'png' });
});
