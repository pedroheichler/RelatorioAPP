# RelatorioAPP 

Gerador de documentos clínicos com IA para profissionais de saúde.
Psicólogos, fonoaudiólogos, terapeutas ocupacionais — solo ou em clínica.

## Funcionalidades

- 6 tipos de documento: Relatório de Sessão, PTS, Solicitação, Evolução, Relatório do Dia, Avaliação
- Ditado por voz (Web Speech API em pt-BR)
- Cabeçalho com logo da clínica
- Rodapé com foto da assinatura + CRP/registro
- Exporta `.docx` editável no Word

## Estrutura

```
RelatorioAPP/
├── server.js               ← backend Express
├── package.json
├── .env.example
├── setup.sh                ← instala tudo de uma vez
├── public/                 ← frontend buildado (gerado pelo Vite)
├── uploads/                ← imagens temporárias (se necessário)
└── src/
    ├── docx/
    │   ├── buildDocument.js    ← monta o .docx (cabeçalho, corpo, rodapé)
    │   ├── templates.js        ← definição de cada tipo de documento
    │   ├── aiPrompts.js        ← prompts do Claude por template
    │   └── generateRoute.js    ← rotas Express (/gerar-form, /gerar, /templates)
    └── frontend/               ← React + Vite
        └── src/
            ├── App.jsx                         ← fluxo em 3 steps
            ├── hooks/useVoice.js               ← reconhecimento de voz
            └── components/
                ├── TemplateSelector.jsx        ← seleção do tipo de doc
                ├── DynamicForm.jsx             ← formulário dinâmico + voz
                └── ProfessionalConfig.jsx      ← logo, assinatura, nome

```

## Como rodar

```bash
# 1. Instalar tudo
bash setup.sh

# 2. Configurar API key
cp .env.example .env
# Editar .env e colocar: ANTHROPIC_API_KEY=sk-ant-...

# 3. Desenvolvimento
# Terminal 1 — backend
npm run dev

# Terminal 2 — frontend
cd src/frontend && npm run dev
# Acesse http://localhost:5173

# 4. Produção (build)
cd src/frontend && npm run build
cd ../..
npm start
# Acesse http://localhost:3000
```

## API

### POST /api/gerar-form
multipart/form-data com campos:
- `templateId` — ID do template
- `data` — JSON com os campos do formulário
- `clinic` — JSON com nome, subtítulo da clínica
- `professional` — JSON com nome, título, registro
- `logo` — arquivo de imagem (opcional)
- `signature` — arquivo de imagem (opcional)

### POST /api/gerar
JSON puro (sem imagens, para testes/integrações).

### GET /api/templates
Lista todos os templates disponíveis com seus campos.
