import { useState, useEffect } from 'react'
import { LanguageProvider } from './context/LanguageContext'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'

type View = 'discover' | 'map'

function getInitialView(): View {
  return window.location.hash === '#map' ? 'map' : 'discover'
}

export default function App() {
  const [view, setView] = useState<View>(getInitialView)

  useEffect(() => {
    window.location.hash = view === 'map' ? '#map' : ''
  }, [view])

  return (
    <LanguageProvider>
      {view === 'map'
        ? <MapPage onSwitchView={() => setView('discover')} />
        : <HomePage onSwitchToMap={() => setView('map')} />}
    </LanguageProvider>
  )
}
