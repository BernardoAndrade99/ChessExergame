import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setStockfish } = useGameStore()

  const clearSearchTimeout = useCallback(() => {
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    // Use single-threaded Stockfish worker directly (no SharedArrayBuffer required)
    const worker = new Worker('/stockfish-sf.js')
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      const raw = (typeof e.data === 'object' && e.data && 'data' in e.data)
        ? (e.data as { data: unknown }).data
        : e.data
      const line = String(raw ?? '').trim()
      if (!line) return

      if (line === 'uciok') {
        worker.postMessage('isready')
        return
      }

      if (line === 'readyok') {
        console.log('[Stockfish] ready')
        setStockfish({ isThinking: false, isReady: true })
        return
      }

      if (line.startsWith('info') && line.includes('score')) {
        const depthMatch = line.match(/depth (\d+)/)
        const cpMatch = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)
        const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0
        let evaluation = 0
        if (cpMatch) evaluation = parseInt(cpMatch[1], 10)
        if (mateMatch) evaluation = parseInt(mateMatch[1], 10) > 0 ? 9999 : -9999
        setStockfish({ evaluation, depth })
        return
      }

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        const bestMove = (parts[1] && parts[1] !== '(none)') ? parts[1] : null
        console.log('[Stockfish] bestmove:', bestMove)
        clearSearchTimeout()
        setStockfish({ bestMove, isThinking: false })
      }
    }

    worker.onerror = (e) => {
      console.error('[Stockfish] worker error:', e.message)
      clearSearchTimeout()
      setStockfish({ isThinking: false })
    }

    worker.postMessage('uci')

    return () => {
      clearSearchTimeout()
      worker.postMessage('quit')
      worker.terminate()
      workerRef.current = null
    }
  }, [setStockfish, clearSearchTimeout])

  const getBestMove = useCallback((fen: string, movetime = 1200) => {
    const worker = workerRef.current
    if (!worker) return
    console.log('[Stockfish] requesting bestmove for:', fen)
    setStockfish({ isThinking: true, bestMove: null })
    clearSearchTimeout()
    searchTimeoutRef.current = setTimeout(() => {
      setStockfish({ isThinking: false })
      searchTimeoutRef.current = null
    }, movetime + 2000)
    worker.postMessage('stop')
    worker.postMessage(`position fen ${fen}`)
    worker.postMessage(`go movetime ${movetime}`)
  }, [setStockfish, clearSearchTimeout])

  const analyzePosition = useCallback((fen: string, depth = 14) => {
    const worker = workerRef.current
    if (!worker) return
    setStockfish({ isThinking: true })
    worker.postMessage('stop')
    worker.postMessage(`position fen ${fen}`)
    worker.postMessage(`go depth ${depth}`)
  }, [setStockfish])

  const stopSearch = useCallback(() => {
    clearSearchTimeout()
    workerRef.current?.postMessage('stop')
    setStockfish({ isThinking: false })
  }, [setStockfish, clearSearchTimeout])

  const newGame = useCallback(() => {
    clearSearchTimeout()
    workerRef.current?.postMessage('stop')
    workerRef.current?.postMessage('ucinewgame')
    workerRef.current?.postMessage('isready')
    setStockfish({ bestMove: null, evaluation: 0, depth: 0, isThinking: false })
  }, [setStockfish, clearSearchTimeout])

  return { analyzePosition, getBestMove, stopSearch, newGame }
}
