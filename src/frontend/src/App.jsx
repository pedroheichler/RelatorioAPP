import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Settings from './pages/Settings'
import History from './pages/History'
import TemplateSelector from './components/TemplateSelector'
import DynamicForm from './components/DynamicForm'
import styles from './App.module.css'

const STEPS = ['Documento', 'Dados', 'Gerar']

export default function App() {
  const { session, profile, signOut } = useAuth()
  const [page, setPage] = useState('generate') // 'generate' | 'history' | 'settings'
  const [step, setStep] = useState(0)
  const [template, setTemplate] = useState(null)
  const [formValues, setFormValues] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Enquanto sessão carrega
  if (session === undefined) {
    return <div className={styles.splash}>Carregando...</div>
  }

  // Não logado → tela de login
  if (!session) return <Login />

  const handleSelectTemplate = (t) => { setTemplate(t); setFormValues({}) }

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('templateId', template.id)
      formData.append('data', JSON.stringify(formValues))
      formData.append('clinic', JSON.stringify({
        name: profile?.clinic_name || '',
        subtitle: profile?.clinic_sub || '',
      }))
      formData.append('professional', JSON.stringify({
        name: profile?.name || '',
        title: profile?.title || '',
        registry: profile?.registry || '',
      }))

      // Imagens: busca do Supabase Storage via URL pública
      // (o backend não precisa receber como arquivo — pode usar URL)
      // Por simplicidade, passamos as URLs no JSON e o backend faz fetch
      formData.append('logoUrl', profile?.logo_url || '')
      formData.append('signatureUrl', profile?.signature_url || '')

      const res = await fetch('/api/gerar-form', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao gerar documento')
      }

      // Download automático
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${template.name}_${formValues.patientName || formValues.date || 'doc'}.docx`
      a.click()
      URL.revokeObjectURL(url)

      // Salva no histórico (Supabase)
      const { supabase } = await import('./lib/supabase')
      await supabase.from('documents').insert({
        template_id:   template.id,
        template_name: template.name,
        patient_name:  formValues.patientName || null,
        doc_date:      formValues.sessionDate || formValues.date || null,
      })

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const canAdvance = [!!template, true]

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandLogo}>R<em>A</em></span>
        </div>
        <nav className={styles.nav}>
          <button
            className={`${styles.navBtn} ${page === 'generate' ? styles.navActive : ''}`}
            onClick={() => setPage('generate')}
            title="Gerar documento"
          >📝</button>
          <button
            className={`${styles.navBtn} ${page === 'history' ? styles.navActive : ''}`}
            onClick={() => setPage('history')}
            title="Histórico"
          >📂</button>
          <button
            className={`${styles.navBtn} ${page === 'settings' ? styles.navActive : ''}`}
            onClick={() => setPage('settings')}
            title="Configurações"
          >⚙️</button>
        </nav>
        <button className={styles.navBtn} onClick={signOut} title="Sair">🚪</button>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <header className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>
              {page === 'generate' && 'Novo Documento'}
              {page === 'history' && 'Histórico'}
              {page === 'settings' && 'Configurações'}
            </h1>
          </div>
          <div className={styles.userBadge}>
            <span className={styles.userName}>{profile?.name || session.user.email}</span>
            {profile?.registry && <span className={styles.userReg}>{profile.registry}</span>}
          </div>
        </header>

        <div className={styles.content}>
          {page === 'history'  && <History />}
          {page === 'settings' && <Settings />}
          {page === 'generate' && (
            <div className={styles.generateWrap}>
              {/* Stepper */}
              <div className={styles.stepper}>
                {STEPS.map((label, i) => (
                  <button
                    key={i}
                    className={`${styles.stepBtn} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                  >
                    <span className={styles.stepNum}>{i < step ? '✓' : i + 1}</span>
                    <span className={styles.stepLabel}>{label}</span>
                  </button>
                ))}
              </div>

              {/* Card */}
              <div className={styles.card}>
                {step === 0 && (
                  <>
                    <h2 className={styles.cardTitle}>Qual documento precisa gerar?</h2>
                    <TemplateSelector selected={template} onSelect={handleSelectTemplate} />
                  </>
                )}

                {step === 1 && template && (
                  <>
                    <h2 className={styles.cardTitle}>{template.name}</h2>
                    <p className={styles.cardSub}>Preencha os campos ou use o microfone para ditar.</p>
                    <DynamicForm template={template} values={formValues} onChange={setFormValues} />
                    {error && <div className={styles.error}>⚠️ {error}</div>}
                  </>
                )}

                <div className={styles.navRow}>
                  {step > 0 && (
                    <button className={styles.btnSecondary} onClick={() => setStep(s => s - 1)} disabled={loading}>
                      ← Voltar
                    </button>
                  )}
                  {step < 1 ? (
                    <button className={styles.btnPrimary} onClick={() => setStep(s => s + 1)} disabled={!canAdvance[step]}>
                      Continuar →
                    </button>
                  ) : (
                    <button className={styles.btnGenerate} onClick={handleGenerate} disabled={loading}>
                      {loading
                        ? <span className={styles.dots}><span/><span/><span/></span>
                        : '⬇ Gerar e Baixar .docx'}
                    </button>
                  )}
                </div>
              </div>

              {!profile?.name && (
                <div className={styles.profileWarning}>
                  ⚠️ Configure seu nome e assinatura em{' '}
                  <button className={styles.linkBtn} onClick={() => setPage('settings')}>Configurações</button>
                  {' '}para aparecerem no documento.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
