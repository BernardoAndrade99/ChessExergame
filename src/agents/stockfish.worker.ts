/// <reference lib="webworker" />

// Stockfish UCI Web Worker
// Loads stockfish.wasm from /public via importScripts

interface StockfishEngine {
  postMessage: (message: string) => void
  addMessageListener: (listener: (line: string) => void) => void
}

type StockfishFactory = () => Promise<StockfishEngine>

type InboundMessage = {
  type: 'init' | 'position' | 'go' | 'stop' | 'newgame'
  payload?: { fen?: string; depth?: number; movetime?: number }
}

type WorkerScope = DedicatedWorkerGlobalScope & typeof globalThis & { Stockfish?: StockfishFactory }

const workerScope = self as WorkerScope

let sf: StockfishEngine | null = null
let stockfishReady = false

self.onmessage = async (e: MessageEvent<InboundMessage>) => {
  const msg = e.data

  if (msg.type === 'init') {
    await initStockfish()
    return
  }

  if (!sf || !stockfishReady) return

  if (msg.type === 'position' && msg.payload?.fen) {
    sf.postMessage(`position fen ${msg.payload.fen}`)
  } else if (msg.type === 'go') {
    const { depth, movetime } = msg.payload ?? {}
    sf.postMessage(movetime ? `go movetime ${movetime}` : `go depth ${depth ?? 15}`)
  } else if (msg.type === 'stop') {
    sf.postMessage('stop')
  } else if (msg.type === 'newgame') {
    sf.postMessage('ucinewgame')
  }
}

async function initStockfish() {
  try {
    // Load stockfish.js from the public directory
    importScripts('/stockfish.js')

    const StockfishFactory = workerScope.Stockfish
    if (typeof StockfishFactory !== 'function') {
      throw new Error('Stockfish not found after importScripts')
    }

    const engine = await StockfishFactory()
    sf = engine

    engine.addMessageListener((line: string) => {
      if (line === 'uciok') {
        engine.postMessage('isready')
      }
      if (line === 'readyok') {
        stockfishReady = true
        workerScope.postMessage({ type: 'ready' })
      }
      if (line.startsWith('info') && line.includes('score')) {
        const depthMatch = line.match(/depth (\d+)/)
        const cpMatch    = line.match(/score cp (-?\d+)/)
        const mateMatch  = line.match(/score mate (-?\d+)/)
        const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0
        let evaluation = 0
        if (cpMatch)   evaluation = parseInt(cpMatch[1], 10)
        if (mateMatch) evaluation = parseInt(mateMatch[1], 10) > 0 ? 9999 : -9999
        workerScope.postMessage({ type: 'info', payload: { depth, evaluation } })
      }
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        const bestMove = parts[1] !== '(none)' ? parts[1] : null
        workerScope.postMessage({ type: 'bestmove', payload: { bestMove } })
      }
    })

    engine.postMessage('uci')
  } catch (err) {
    console.error('[StockfishWorker] init failed:', err)
    workerScope.postMessage({ type: 'error', payload: { message: String(err) } })
  }
}
