import { useEffect, useState } from 'react'
/** Visible-document tours never run under reduced motion; selecting content pauses them. */
export function useTour(count: number, interval = 6500, enabled = true) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(true)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPlaying(!media.matches)
    setVisible(!document.hidden)
    const motion = () => { if (media.matches) setPlaying(false) }
    document.addEventListener('visibilitychange', visibility); media.addEventListener('change', motion)
    return () => { document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', motion) }
  }, [])
  useEffect(() => {
    if (!playing || !visible || held || !enabled || count < 2) return
    const timer = window.setInterval(() => setIndex(value => (value + 1) % count), interval)
    return () => clearInterval(timer)
  }, [playing, visible, held, enabled, count, interval])
  const select = (next: number) => { setIndex(next); setPlaying(false) }
  return { index, playing, setPlaying, held, setHeld, select }
}
