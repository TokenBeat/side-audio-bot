// 订阅晚晴伴场景服务的状态投影（SSE）。
import { useEffect, useRef, useState } from 'react'
import { gatewayHttpUrl } from '../config/gateway'

export default function useHomeState({ homeId = 'default' } = {}) {
  const [state, setState] = useState(null)
  const [activities, setActivities] = useState([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const url = new URL('/api/home/events', gatewayHttpUrl('/'))
    url.searchParams.set('homeId', homeId)
    const source = new EventSource(url.toString())

    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    source.addEventListener('snapshot', event => {
      setState(JSON.parse(event.data))
      setConnected(true)
    })
    source.addEventListener('state', () => {
      fetch(gatewayHttpUrl(`/api/home/state?homeId=${encodeURIComponent(homeId)}`))
        .then(response => response.json())
        .then(snapshot => setState(snapshot))
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

    return () => source.close()
  }, [homeId])

  return { state, activities, connected }
}
