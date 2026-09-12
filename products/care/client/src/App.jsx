import { useMemo } from 'react'
import RoomTerminal from './components/RoomTerminal.jsx'
import StationBoard from './components/StationBoard.jsx'
import FamilyView from './components/FamilyView.jsx'

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, '')
  const roomMatch = path.match(/\/room\/([^/]+)$/u)
  if (roomMatch) return { view: 'room', roomId: decodeURIComponent(roomMatch[1]) }
  if (path.endsWith('/family')) return { view: 'family' }
  return { view: 'station' }
}

export default function App() {
  const route = useMemo(currentRoute, [])
  if (route.view === 'room') return <RoomTerminal roomId={route.roomId} />
  if (route.view === 'family') return <FamilyView />
  return <StationBoard />
}
