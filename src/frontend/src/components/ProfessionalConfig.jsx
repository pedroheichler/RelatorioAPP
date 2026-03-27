import styles from './ProfessionalConfig.module.css'

export default function ProfessionalConfig({ clinic, professional, onClinicChange, onProfChange }) {
  const handleClinicFile = (key, e) => {
    const file = e.target.files[0]
    if (!file) return
    onClinicChange({ ...clinic, [key]: file, [`${key}Preview`]: URL.createObjectURL(file) })
  }

  const handleProfFile = (key, e) => {
    const file = e.target.files[0]
    if (!file) return
    onProfChange({ ...professional, [key]: file, [`${key}Preview`]: URL.createObjectURL(file) })
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Clínica / Consultório</h3>
        <div className={styles.row}>
          <div className={styles.group}>
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              value={clinic.name || ''}
              onChange={e => onClinicChange({ ...clinic, name: e.target.value })}
              placeholder="Ex: Clínica Espaço Estimular"
            />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Subtítulo</label>
            <input
              className={styles.input}
              value={clinic.subtitle || ''}
              onChange={e => onClinicChange({ ...clinic, subtitle: e.target.value })}
              placeholder="Ex: Psicologia e Neurodesenvolvimento"
            />
          </div>
        </div>

        <div className={styles.group}>
          <label className={styles.label}>Logo (PNG ou JPG)</label>
          <div className={styles.uploadRow}>
            <label className={styles.uploadBtn}>
              {clinic.logoPreview ? '✓ Trocar logo' : '+ Enviar logo'}
              <input type="file" accept="image/*" hidden onChange={e => handleClinicFile('logo', e)} />
            </label>
            {clinic.logoPreview && (
              <img src={clinic.logoPreview} alt="logo" className={styles.preview} />
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Profissional</h3>
        <div className={styles.row}>
          <div className={styles.group}>
            <label className={styles.label}>Nome completo</label>
            <input
              className={styles.input}
              value={professional.name || ''}
              onChange={e => onProfChange({ ...professional, name: e.target.value })}
              placeholder="Ex: Dra. Ana Paula Silva"
            />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Especialidade</label>
            <input
              className={styles.input}
              value={professional.title || ''}
              onChange={e => onProfChange({ ...professional, title: e.target.value })}
              placeholder="Ex: Psicóloga Clínica"
            />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Registro (CRP / CRFa / CRM...)</label>
            <input
              className={styles.input}
              value={professional.registry || ''}
              onChange={e => onProfChange({ ...professional, registry: e.target.value })}
              placeholder="Ex: CRP 09/12345"
            />
          </div>
        </div>

        <div className={styles.group}>
          <label className={styles.label}>Assinatura (PNG ou JPG)</label>
          <div className={styles.uploadRow}>
            <label className={styles.uploadBtn}>
              {professional.signaturePreview ? '✓ Trocar assinatura' : '+ Enviar assinatura'}
              <input type="file" accept="image/*" hidden onChange={e => handleProfFile('signature', e)} />
            </label>
            {professional.signaturePreview && (
              <img src={professional.signaturePreview} alt="assinatura" className={styles.preview} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
