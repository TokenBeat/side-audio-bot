import { useMemo } from 'react'
import ElderTerminal from './components/ElderTerminal.jsx'
import FamilyHomeView from './components/FamilyHomeView.jsx'

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path.endsWith('/elder')) return { view: 'elder' }
  return { view: 'family' }
}

export default function App() {
  const route = useMemo(currentRoute, [])
  if (route.view === 'elder') return <ElderTerminal />
  return <FamilyHomeView />
}
