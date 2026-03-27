import { useState, useEffect } from 'react'
import styles from './TemplateSelector.module.css'

const ICONS = {
  relatorio_sessao:    '🧠',
  evolucao:            '📋',
  solicitacao:         '📤',
  pts:                 '⭐',
  relatorio_dia:       '📅',
  relatorio_avaliacao: '🔍',
}

export default function TemplateSelector({ selected, onSelect }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => { setTemplates(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className={styles.loading}>Carregando templates...</p>

  return (
    <div className={styles.grid}>
      {templates.map(t => (
        <button
          key={t.id}
          className={`${styles.card} ${selected?.id === t.id ? styles.active : ''}`}
          onClick={() => onSelect(t)}
        >
          <span className={styles.icon}>{ICONS[t.id] || '📄'}</span>
          <span className={styles.name}>{t.name}</span>
        </button>
      ))}
    </div>
  )
}
