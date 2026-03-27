import { useState, useRef, useCallback } from 'react'

export function useVoice(onTranscript) {
  const [isRecording, setIsRecording] = useState(false)
  const [supported] = useState(
    () => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  )
  const recogRef = useRef(null)
  const baseTextRef = useRef('')

  const start = useCallback((currentText = '') => {
    if (!supported) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new SR()
    r.lang = 'pt-BR'
    r.continuous = true
    r.interimResults = true
    recogRef.current = r
    baseTextRef.current = currentText

    r.onstart = () => setIsRecording(true)

    r.onresult = (e) => {
      let final = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      onTranscript(baseTextRef.current + final + interim)
      if (final) baseTextRef.current += final
    }

    r.onend = () => setIsRecording(false)
    r.onerror = () => setIsRecording(false)
    r.start()
  }, [supported, onTranscript])

  const stop = useCallback(() => {
    recogRef.current?.stop()
    setIsRecording(false)
  }, [])

  const toggle = useCallback((currentText) => {
    if (isRecording) stop()
    else start(currentText)
  }, [isRecording, start, stop])

  return { isRecording, supported, toggle }
}
