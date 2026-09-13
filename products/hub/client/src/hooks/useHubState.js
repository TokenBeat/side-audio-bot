// 订阅晚晴·家场景服务的状态投影（SSE）。
import { useEffect, useState } from 'react'
import { gatewayHttpUrl } from '../config/gateway'

export default function useHubState({ hubId = 'default' } = {}) {
  const [state, setState] = useState(null)
  const [activities, setActivities] = useState([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const url = new URL('/api/hub/events', gatewayHttpUrl('/'))
    url.searchParams.set('hubId', hubId)
    const source = new EventSource(url.toString())

    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    source.addEventListener('snapshot', event => {
      setState(JSON.parse(event.data))
      setConnected(true)
    })
    source.addEventListener('state', () => {
      fetch(gatewayHttpUrl(`/api/hub/state?hubId=${encodeURIComponent(hubId)}`))
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
  }, [hubId])

  return { state, activities, connected }
}
