# RelatorioAPP

Gerador de documentos clínicos com IA para profissionais de saúde — psicólogos,
fonoaudiólogos, terapeutas ocupacionais, solo ou em clínica.

O profissional escolhe o tipo de documento, dita ou digita as anotações,
**revisa e edita o texto gerado** e baixa um `.docx` editável no Word, já com
cabeçalho da clínica, assinatura e registro profissional.

## Funcionalidades

- **6 tipos de documento**: Relatório de Sessão, Evolução, Solicitação/Encaminhamento,
  PTS (Plano Terapêutico Singular), Relatório do Dia e Relatório de Avaliação
- **Ditado por voz** em pt-BR (Web Speech API — Chrome/Edge)
- **Revisão obrigatória antes do download**: o texto da IA aparece editável por
  seção; o `.docx` é montado a partir do que você aprovou, não de uma segunda
  geração diferente
- **A abordagem molda o texto**: 11 perfis (TCC, psicanálise, ABA, fonoaudiologia,
  TO, psicopedagogia, psiquiatria…) mudam vocabulário e foco, mais um campo livre
  de instruções de estilo
- **Pacientes salvos e atendimento em série**: selecionar um paciente preenche
  nome, nascimento e o próximo número de sessão; ao terminar, "Próximo paciente"
  limpa o formulário sem perder a configuração
- **Histórico local**: reabre um documento gerado para corrigir e baixar de novo
  sem gastar nova geração, e serve de contexto da sessão anterior para a IA
- **Instalável (PWA)**: ícone na tela inicial, abre em tela cheia, casca em cache
- **Rascunho automático** por tipo de documento — fechar a aba não perde o ditado
- Cabeçalho com logo, rodapé com assinatura + CRP/CRFa/CRM, numeração de páginas
- Datas em `dd/mm/aaaa` e idade calculada a partir da data de nascimento

## Privacidade

O **nome do paciente não é enviado ao provedor de IA**. Ele é inserido no
documento localmente, no servidor. As anotações clínicas, essas sim, são
enviadas à Groq (EUA) para redação do texto — o app avisa isso na tela de
preenchimento. Avalie se esse fluxo atende à sua realidade sob a LGPD antes de
usar com dados reais de pacientes.

Se você ligar o contexto da sessão anterior, o **texto do documento anterior
também é enviado** à IA. A opção aparece marcada de forma explícita na tela e
pode ser desligada por documento.

Tudo o que o app guarda — perfil, logo, assinatura, pacientes, histórico de
documentos — fica **apenas no `localStorage` do navegador**. Não há banco de
dados nem contas de usuário. Isso significa que nomes de pacientes e o texto
dos documentos ficam gravados na máquina: em computador compartilhado, use
Configurações › Dados salvos para apagar ao terminar.

## Estrutura

```
RelatorioAPP/
├── server.js                  ← app Express (estáticos + /api)
├── api/index.js               ← entrypoint da Vercel (reexporta o server)
├── vercel.json
├── supabase_schema.sql        ← schema PLANEJADO, ainda não ligado (ver abaixo)
├── test/                      ← node:test, sem dependências extras
├── public/                    ← frontend, sem build step
│   ├── index.html
│   ├── styles.css
│   ├── app.js                 ← fluxo, pacientes, histórico, ditado, PWA
│   ├── sw.js                  ← service worker
│   ├── manifest.webmanifest
│   └── icons/
└── src/
    ├── rateLimit.js           ← limitador em memória
    └── docx/
        ├── templates.js       ← definição dos 6 documentos (campos + seções)
        ├── approaches.js      ← abordagens teóricas e seu efeito no prompt
        ├── aiPrompts.js       ← prompts, JSON mode, retry, tratamento de erro
        ├── buildDocument.js   ← montagem do .docx
        ├── format.js          ← datas, idade, limpeza de texto
        ├── image.js           ← formato/dimensões por magic bytes
        └── generateRoute.js   ← rotas /templates, /preview, /gerar, /gerar-form
```

## Como rodar

```bash
npm install

cp .env.example .env
# preencha GROQ_API_KEY com uma chave de console.groq.com/keys

npm run dev      # http://localhost:3000
npm test         # 42 testes, sem rede
```

Não há etapa de build: os arquivos de `public/` são servidos direto.

O service worker e o "Instalar" só aparecem em `https://` ou `localhost` —
é exigência do navegador, não configuração do app.

## API

| Rota | Método | Descrição |
|---|---|---|
| `/api/templates` | GET | Lista os documentos e seus campos |
| `/api/approaches` | GET | Lista as abordagens teóricas disponíveis |
| `/api/preview` | POST | Gera o conteúdo (JSON) para revisão, sem montar o arquivo |
| `/api/gerar-form` | POST | `multipart/form-data` → `.docx` (usado pelo frontend) |
| `/api/gerar` | POST | JSON puro → `.docx` (integrações/testes) |
| `/api/health` | GET | Status e se a chave de IA está configurada |

`/gerar` e `/gerar-form` aceitam um campo `content` com o texto já revisado.
Quando ele está presente a IA **não** é chamada de novo — é assim que o botão
"Baixar .docx" garante que o arquivo bate com o que estava na tela.

Exemplo sem IA (monta o documento a partir de texto pronto):

```bash
curl -X POST http://localhost:3000/api/gerar \
  -H 'Content-Type: application/json' \
  -o saida.docx \
  -d '{
    "templateId": "evolucao",
    "data": { "patientName": "Maria", "date": "2026-08-12", "notes": "-" },
    "content": { "evolucao": "Texto da evolução.", "conduta": "Manter plano." },
    "professional": { "name": "Ana Souza", "registry": "CRP 06/12345" }
  }'
```

## Limites conhecidos

- **Rate limit é por instância.** Em serverless cada lambda tem a própria
  memória, então o limite de 30 gerações / 10 min não é global. Proteção real
  exige autenticação ou um store compartilhado.
- **Não há autenticação.** Com o app publicado, quem souber a URL consegue
  gastar sua cota da Groq.
- **Supabase não está ligado.** `supabase_schema.sql` descreve perfis, histórico
  de documentos e RLS, mas nenhum código usa. Os campos `logoUrl`/`signatureUrl`
  em `/api/gerar` já aceitam URLs remotas, deixando o caminho pronto para quando
  o login existir.
- **Imagens devem ser PNG.** O `docx@8.5` grava toda mídia como `.png` no
  pacote (o `ImageRun` não aceita declarar o tipo), então um JPEG produziria um
  arquivo não-conforme. O frontend converte tudo para PNG antes de enviar; quem
  chamar a API direto deve mandar PNG.
- **`vercel.json` roteia todo o tráfego pela função.** Funciona, mas serve o
  HTML estático via lambda. Separar em build estático reduziria latência e custo.

## Roadmap sugerido

1. Login + persistência (Supabase já modelado): configurações que sobrevivem à
   troca de navegador e histórico de documentos gerados.
2. Rate limit compartilhado e autenticação nas rotas de geração.
3. Exportar também em PDF.
