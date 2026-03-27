import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './Settings.module.css'

export default function Settings() {
  const { profile, updateProfile, uploadImage, session } = useAuth()

  const [form, setForm] = useState({
    name:        profile?.name || '',
    title:       profile?.title || '',
    registry:    profile?.registry || '',
    clinic_name: profile?.clinic_name || '',
    clinic_sub:  profile?.clinic_sub || '',
  })
  const [logoFile, setLogoFile]           = useState(null)
  const [signatureFile, setSignatureFile] = useState(null)
  const [logoPreview, setLogoPreview]     = useState(profile?.logo_url || null)
  const [sigPreview, setSigPreview]       = useState(profile?.signature_url || null)
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [error, setError]                 = useState('')

  const userId = session?.user?.id

  const handleFile = (type, e) => {
    const file = e.target.files[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    if (type === 'logo') { setLogoFile(file); setLogoPreview(preview) }
    else { setSignatureFile(file); setSigPreview(preview) }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      let logo_url      = profile?.logo_url || null
      let signature_url = profile?.signature_url || null

      // Upload logo se tiver novo arquivo
      if (logoFile) {
        const { url, error } = await uploadImage('avatars', logoFile, `${userId}/logo.png`)
        if (error) throw new Error('Erro ao enviar logo: ' + error.message)
        logo_url = url
      }

      // Upload assinatura se tiver novo arquivo
      if (signatureFile) {
        const { url, error } = await uploadImage('avatars', signatureFile, `${userId}/signature.png`)
        if (error) throw new Error('Erro ao enviar assinatura: ' + error.message)
        signature_url = url
      }

      const { error } = await updateProfile({ ...form, logo_url, signature_url })
      if (error) throw new Error('Erro ao salvar perfil: ' + error.message)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Configurações</h2>
      <p className={styles.pageSub}>Seus dados aparecem no cabeçalho e rodapé de todos os documentos.</p>

      {/* Profissional */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Profissional</h3>
        <div className={styles.grid}>
          <Field label="Nome completo" value={form.name}
            onChange={v => setForm(f => ({ ...f, name: v }))}
            placeholder="Ex: Dra. Ana Paula Silva" />
          <Field label="Especialidade / Título" value={form.title}
            onChange={v => setForm(f => ({ ...f, title: v }))}
            placeholder="Ex: Psicóloga Clínica" />
          <Field label="Registro (CRP / CRFa / CRM...)" value={form.registry}
            onChange={v => setForm(f => ({ ...f, registry: v }))}
            placeholder="Ex: CRP 09/12345" />
        </div>

        <div className={styles.uploadGroup}>
          <label className={styles.label}>Assinatura</label>
          <div className={styles.uploadRow}>
            <label className={styles.uploadBtn}>
              {sigPreview ? '✓ Trocar assinatura' : '+ Enviar assinatura'}
              <input type="file" accept="image/*" hidden onChange={e => handleFile('sig', e)} />
            </label>
            {sigPreview && <img src={sigPreview} alt="assinatura" className={styles.preview} />}
          </div>
          <p className={styles.hint}>Fundo transparente ou branco. PNG recomendado.</p>
        </div>
      </section>

      {/* Clínica */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Clínica / Consultório</h3>
        <div className={styles.grid}>
          <Field label="Nome da clínica" value={form.clinic_name}
            onChange={v => setForm(f => ({ ...f, clinic_name: v }))}
            placeholder="Ex: Clínica Espaço Estimular" />
          <Field label="Subtítulo" value={form.clinic_sub}
            onChange={v => setForm(f => ({ ...f, clinic_sub: v }))}
            placeholder="Ex: Psicologia e Neurodesenvolvimento" />
        </div>

        <div className={styles.uploadGroup}>
          <label className={styles.label}>Logo</label>
          <div className={styles.uploadRow}>
            <label className={styles.uploadBtn}>
              {logoPreview ? '✓ Trocar logo' : '+ Enviar logo'}
              <input type="file" accept="image/*" hidden onChange={e => handleFile('logo', e)} />
            </label>
            {logoPreview && <img src={logoPreview} alt="logo" className={styles.preview} />}
          </div>
          <p className={styles.hint}>PNG ou JPG. Tamanho recomendado: 400×150px.</p>
        </div>
      </section>

      {error && <div className={styles.error}>⚠️ {error}</div>}

      <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
        {saving
          ? <span className={styles.dots}><span/><span/><span/></span>
          : saved ? '✓ Salvo!' : 'Salvar configurações'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
