/**
 * Checagem estática da ligação entre public/app.js e public/index.html.
 *
 * Com o frontend em arquivos separados, o erro mais fácil de cometer é o
 * app.js chamar um id que o HTML não tem (ou deixou de ter). Isso falha em
 * silêncio no navegador — `$('x')` devolve null e o listener nunca é ligado.
 * Aqui isso vira um teste vermelho.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');

/** Ids criados em tempo de execução pelo próprio app.js. */
const DYNAMIC_IDS = new Set(['patientPicker', 'contextRow', 'usePreviousContext']);

function idsInHtml() {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

function idsRequestedByApp() {
  const ids = new Set();
  // $('algo') e getElementById('algo') — apenas literais entre aspas simples
  for (const m of app.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)) ids.add(m[1]);
  for (const m of app.matchAll(/getElementById\('([A-Za-z][\w-]*)'\)/g)) ids.add(m[1]);
  return ids;
}

test('todo id pedido pelo app.js existe no index.html', () => {
  const available = idsInHtml();
  const missing = [...idsRequestedByApp()]
    .filter((id) => !available.has(id) && !DYNAMIC_IDS.has(id));

  assert.deepEqual(missing, [], `ids ausentes no HTML: ${missing.join(', ')}`);
});

test('cada data-close-modal aponta para um modal existente', () => {
  const modals = new Set([...html.matchAll(/<div id="(\w+)" class="modal"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/data-close-modal="(\w+)"/g)].map((m) => m[1]);

  assert.ok(targets.length > 0, 'nenhum botão de fechar encontrado');
  for (const target of targets) {
    assert.ok(modals.has(target), `data-close-modal="${target}" não corresponde a nenhum modal`);
  }
});

test('index.html carrega os arquivos que existem em public/', () => {
  const refs = [...html.matchAll(/(?:href|src)="\/([^"]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => !ref.startsWith('http'));

  for (const ref of refs) {
    assert.ok(
      fs.existsSync(path.join(PUBLIC_DIR, ref)),
      `index.html referencia /${ref}, que não existe em public/`,
    );
  }
});

test('o service worker pré-cacheia apenas arquivos que existem', () => {
  const sw = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));

  for (const m of shell.matchAll(/'\/([^']*)'/g)) {
    if (m[1] === '') continue; // a raiz '/' é servida pelo index.html
    assert.ok(
      fs.existsSync(path.join(PUBLIC_DIR, m[1])),
      `sw.js tenta cachear /${m[1]}, que não existe em public/`,
    );
  }
});

test('o service worker nunca cacheia /api', () => {
  const sw = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
  assert.ok(
    /url\.pathname\.startsWith\('\/api\/'\)/.test(sw),
    'sw.js precisa deixar /api passar direto para a rede',
  );
});

test('o CSS não deixa o atributo hidden ser vencido por display de classe', () => {
  // Regressão real: `.notice { display:flex }` sobrepunha o `[hidden]` do
  // navegador, e avisos marcados como ocultos apareciam na tela. Só foi
  // detectado renderizando o app — daí este guarda-corpo.
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ''); // comentários citam a regra e confundem a busca
  const rule = css.match(/\[hidden\]\s*\{[^}]*\}/);

  assert.ok(rule, 'styles.css precisa de uma regra [hidden]');
  assert.match(rule[0], /display:\s*none\s*!important/, 'a regra [hidden] precisa de !important');
});

test('o manifest aponta para ícones que existem', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.icons.length >= 2);

  for (const icon of manifest.icons) {
    const file = path.join(PUBLIC_DIR, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `ícone ausente: ${icon.src}`);

    // Confere que o PNG realmente tem o tamanho declarado no manifest
    const buf = fs.readFileSync(file);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} não tem o tamanho declarado`);
  }
});
