#!/bin/bash
# setup.sh — instala dependências do backend e frontend

echo "📦 Instalando dependências do backend..."
npm install

echo "📦 Instalando dependências do frontend..."
cd src/frontend && npm install && cd ../..

echo ""
echo "✅ Pronto! Agora:"
echo ""
echo "  1. Copie o .env.example para .env e adicione sua API key:"
echo "     cp .env.example .env"
echo ""
echo "  2. Para rodar em desenvolvimento (backend + frontend juntos):"
echo "     Terminal 1: npm run dev"
echo "     Terminal 2: cd src/frontend && npm run dev"
echo ""
echo "  3. Para buildar o frontend e integrar ao backend:"
echo "     cd src/frontend && npm run build"
echo "     npm start"
echo ""
echo "  Acesse: http://localhost:3000"
