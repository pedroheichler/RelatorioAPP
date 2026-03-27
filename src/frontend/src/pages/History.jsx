import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './History.module.css'

const TEMPLATE_ICONS = {
  relatorio_sessao:    '🧠',
  evolucao:            '📋',
  solicitacao:         '📤',
  pts:                 '⭐',
  relatorio_dia:       '📅',
  relatorio_avaliacao: '🔍',
}

export default function History() {
  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Remover este registro do histórico?')) return
    setDeleting(id)
    await supabase.from('documents').delete().eq('id', id)
    setDocs(d => d.filter(doc => doc.id !== id))
    setDeleting(null)
  }

  if (loading) return <div className={styles.empty}>Carregando histórico...</div>

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Histórico</h2>
      <p className={styles.pageSub}>{docs.length} documento{docs.length !== 1 ? 's' : ''} gerado{docs.length !== 1 ? 's' : ''}</p>

      {docs.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📄</span>
          <p>Nenhum documento gerado ainda.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {docs.map(doc => (
            <li key={doc.id} className={styles.item}>
              <span className={styles.icon}>
                {TEMPLATE_ICONS[doc.template_id] || '📄'}
              </span>
              <div className={styles.info}>
                <span className={styles.templateName}>{doc.template_name}</span>
                {doc.patient_name && (
                  <span className={styles.patient}>{doc.patient_name}</span>
                )}
              </div>
              <span className={styles.date}>
                {formatDate(doc.created_at)}
              </span>
              <button
                className={styles.btnDelete}
                onClick={() => handleDelete(doc.id)}
                disabled={deleting === doc.id}
                title="Remover do histórico"
              >
                {deleting === doc.id ? '...' : '×'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
