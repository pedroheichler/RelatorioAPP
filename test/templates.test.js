const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEMPLATES, getTemplate, listTemplates, buildSections, missingRequiredFields,
} = require('../src/docx/templates');
const { extractJson, normalizeContent, buildPrompt } = require('../src/docx/aiPrompts');

test('getTemplate não vaza propriedades do Object.prototype', () => {
  assert.equal(getTemplate('constructor'), null);
  assert.equal(getTemplate('toString'), null);
  assert.equal(getTemplate('inexistente'), null);
  assert.ok(getTemplate('pts'));
});

test('todo template declara aiSections com chaves únicas', () => {
  for (const template of Object.values(TEMPLATES)) {
    assert.ok(template.aiSections.length > 0, `${template.id} sem seções`);
    const keys = template.aiSections.map((section) => section.key);
    assert.equal(new Set(keys).size, keys.length, `${template.id} tem chave duplicada`);
    assert.ok(template.maxTokens >= 1500, `${template.id} com orçamento de tokens baixo demais`);
  }
});

test('listTemplates entrega apenas dados serializáveis', () => {
  const list = listTemplates();
  assert.equal(list.length, Object.keys(TEMPLATES).length);
  assert.equal(JSON.parse(JSON.stringify(list)).length, list.length);
  for (const template of list) {
    assert.ok(Array.isArray(template.fields));
    assert.ok(Array.isArray(template.sections));
  }
});

test('missingRequiredFields aponta os rótulos que faltam', () => {
  const template = getTemplate('relatorio_sessao');
  assert.deepEqual(
    missingRequiredFields(template, {}),
    ['Nome do Paciente', 'Data da Sessão', 'Anotações da Sessão'],
  );
  assert.deepEqual(
    missingRequiredFields(template, { patientName: 'A', sessionDate: '2026-08-12', notes: 'x' }),
    [],
  );
  // Espaço em branco não conta como preenchido
  assert.deepEqual(missingRequiredFields(template, { patientName: '   ', sessionDate: '2026-08-12', notes: 'x' }), ['Nome do Paciente']);
});

test('buildSections formata datas e calcula idade', () => {
  const template = getTemplate('relatorio_sessao');
  const sections = buildSections(template, {
    patientName: 'Maria',
    birthDate: '2018-03-10',
    sessionDate: '2026-08-12',
    sessionNumber: '7',
    modality: 'Online',
  }, { queixaPrincipal: 'texto' });

  const rows = sections.find((section) => section.type === 'patient_data').fields;
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

  assert.equal(byLabel['Data da sessão'], '12/08/2026');
  assert.equal(byLabel.Nascimento, '10/03/2018 (8 anos)');
  assert.equal(byLabel.Paciente, 'Maria');
  // Campos vazios não viram linha "—" na tabela
  assert.ok(!rows.some((row) => !row.value));
});

test('buildSections gera título + texto para cada seção de IA', () => {
  const template = getTemplate('evolucao');
  const sections = buildSections(template, { patientName: 'X', date: '2026-08-12' }, {
    evolucao: 'a', conduta: 'b',
  });

  const headings = sections.filter((section) => section.type === 'section_heading').map((section) => section.text);
  assert.deepEqual(headings, ['Evolução', 'Conduta']);
  assert.deepEqual(
    sections.filter((section) => section.type === 'text').map((section) => section.content),
    ['a', 'b'],
  );
});

test('o prompt não envia o nome do paciente à IA', () => {
  const template = getTemplate('relatorio_sessao');
  const prompt = buildPrompt(template, {
    patientName: 'Joana Nascimento Prado',
    sessionDate: '2026-08-12',
    notes: 'Paciente relatou melhora do sono.',
  });

  assert.ok(!prompt.includes('Joana'), 'o nome do paciente vazou para o prompt');
  assert.ok(prompt.includes('12 de agosto de 2026'), 'data deveria ir por extenso');
  assert.ok(prompt.includes('melhora do sono'));
  assert.ok(prompt.includes('"queixaPrincipal"'));
});

test('extractJson sobrevive a crases e texto ao redor', () => {
  assert.deepEqual(extractJson('{"a":"1"}'), { a: '1' });
  assert.deepEqual(extractJson('```json\n{"a":"1"}\n```'), { a: '1' });
  assert.deepEqual(extractJson('Claro! Segue:\n{"a":"1"}\nEspero ter ajudado.'), { a: '1' });
  assert.equal(extractJson('sem json aqui'), null);
  assert.equal(extractJson('{"a":'), null);       // truncado
  assert.equal(extractJson('[1,2,3]'), null);     // array não serve
});

test('normalizeContent preenche chaves ausentes e achata estruturas', () => {
  const template = getTemplate('evolucao');
  assert.deepEqual(
    normalizeContent(template, { evolucao: ['p1', 'p2'], extra: 'descartado' }),
    { evolucao: 'p1\n\np2', conduta: '' },
  );
  assert.deepEqual(
    normalizeContent(template, null),
    { evolucao: '', conduta: '' },
  );
});
