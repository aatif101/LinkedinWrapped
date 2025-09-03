import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Wrapped from './pages/Wrapped'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/wrapped" element={<Wrapped />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App