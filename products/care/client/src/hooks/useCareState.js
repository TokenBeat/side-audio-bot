// 订阅晚晴·照护场景服务的状态投影（SSE）：snapshot + state/activity 事件。
import { useEffect, useRef, useState } from 'react'
import { gatewayHttpUrl } from '../config/gateway'

export default function useCareState({ careId = 'default' } = {}) {
  const [state, setState] = useState(null)
  const [activities, setActivities] = useState([])
  const [connected, setConnected] = useState(false)
  const stateRef = useRef(null)

  useEffect(() => {
    const url = new URL('/api/care/events', gatewayHttpUrl('/'))
    url.searchParams.set('careId', careId)
    const source = new EventSource(url.toString())
    let closed = false

    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    source.addEventListener('snapshot', event => {
      const snapshot = JSON.parse(event.data)
      stateRef.current = snapshot
      setState(snapshot)
      setConnected(true)
    })
    source.addEventListener('state', () => {
      // state 事件只带版本号；直接拉一次完整快照，演示规模下成本可忽略。
      fetch(gatewayHttpUrl(`/api/care/state?careId=${encodeURIComponent(careId)}`))
        .then(response => response.json())
        .then(snapshot => {
          stateRef.current = snapshot
          setState(snapshot)
        })
        .catch(() => {})
    })
    source.addEventListener('activity', event => {
      try {
        const activity = JSON.parse(event.data)
        setActivities(current => [activity, ...current].slice(0, 30))
      } catch {
        // 忽略坏帧。
      }
    })

    return () => {
      if (closed) return
      closed = true
      source.close()
    }
  }, [careId])

  return { state, activities, connected }
}
