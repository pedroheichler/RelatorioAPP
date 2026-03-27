import { useVoice } from '../hooks/useVoice'
import styles from './DynamicForm.module.css'

export default function DynamicForm({ template, values, onChange }) {
  const handleChange = (key, val) => onChange({ ...values, [key]: val })

  return (
    <div className={styles.form}>
      {template.fields.map(field => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key] || ''}
          onChange={val => handleChange(field.key, val)}
        />
      ))}
    </div>
  )
}

function Field({ field, value, onChange }) {
  const { isRecording, supported, toggle } = useVoice(onChange)

  const label = (
    <label className={styles.label} htmlFor={field.key}>
      {field.label}
    </label>
  )

  if (field.type === 'textarea') {
    return (
      <div className={styles.group}>
        {label}
        <div className={`${styles.voiceWrap} ${isRecording ? styles.recording : ''}`}>
          <textarea
            id={field.key}
            className={styles.textarea}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={isRecording ? '🔴 Gravando... fale agora' : 'Digite ou use o microfone →'}
            rows={5}
          />
          {supported && (
            <button
              type="button"
              className={`${styles.micBtn} ${isRecording ? styles.micActive : ''}`}
              onClick={() => toggle(value)}
              title={isRecording ? 'Parar gravação' : 'Gravar por voz'}
            >
              {isRecording ? '⏹' : '🎙'}
            </button>
          )}
        </div>
        {isRecording && <p className={styles.recHint}>Clique em ⏹ para parar</p>}
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className={styles.group}>
        {label}
        <select
          id={field.key}
          className={styles.select}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Selecione...</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={styles.group}>
      {label}
      <input
        id={field.key}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.label}
        min={field.type === 'number' ? 1 : undefined}
      />
    </div>
  )
}
