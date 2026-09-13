import { useMemo } from 'react'
import HubPanel from './components/HubPanel.jsx'
import RemoteView from './components/RemoteView.jsx'

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path.endsWith('/remote')) return { view: 'remote' }
  return { view: 'panel' }
}

export default function App() {
  const route = useMemo(currentRoute, [])
  if (route.view === 'remote') return <RemoteView />
  return <HubPanel />
}
