import { useState } from 'react'
import gif from './assets/1111.gif'
import UpLoadFile from './upload'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <div className="card">
        <UpLoadFile />
      </div>
      <div className="gif">
        <img src={gif} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  )
}

export default App
