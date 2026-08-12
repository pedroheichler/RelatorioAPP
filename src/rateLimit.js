/**
 * rateLimit.js
 *
 * Limitador de taxa em memória, sem dependências.
 *
 * Ressalva honesta: em serverless (Vercel) cada instância tem a própria
 * memória, então o limite é por instância, não global. Ainda assim segura o
 * caso que importa — alguém achar a URL e disparar a cota da Groq em loop de
 * um único cliente. Proteção de verdade só com autenticação ou um store
 * compartilhado (Redis/Upstash).
 */

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}

function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // chave → { count, resetAt }

  function sweep(now) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    // Varre de vez em quando para o Map não crescer sem limite em processo longo
    if (hits.size > 500) sweep(now);

    const key = clientKey(req);
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || `Muitas requisições. Tente novamente em ${retryAfter}s.`,
        retryAfter,
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter, clientKey };
