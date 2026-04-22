// Single-threaded Stockfish UCI worker
// Uses stockfish.js v10 (pure JS, no WASM threads, works everywhere)

var engine = null;

self.onmessage = function (e) {
  var msg = e.data;
  if (msg === 'init' || (msg && msg.type === 'init')) {
    initEngine();
    return;
  }
  if (!engine) return;

  if (msg && msg.type === 'position') {
    engine.postMessage('position fen ' + msg.payload.fen);
  } else if (msg && msg.type === 'go') {
    if (msg.payload.movetime) {
      engine.postMessage('go movetime ' + msg.payload.movetime);
    } else {
      engine.postMessage('go depth ' + (msg.payload.depth || 15));
    }
  } else if (msg && msg.type === 'stop') {
    engine.postMessage('stop');
  } else if (msg && msg.type === 'newgame') {
    engine.postMessage('ucinewgame');
  }
};

function initEngine() {
  try {
    // stockfish-sf.js is the single-threaded Stockfish 10 — no WASM, no threads
    importScripts('/stockfish-sf.js');
    engine = self.STOCKFISH();

    engine.onmessage = function (line) {
      if (typeof line === 'object' && line.data) line = line.data;
      line = String(line).trim();

      if (line === 'uciok') {
        self.postMessage({ type: 'ready' });
        engine.postMessage('isready');
      } else if (line === 'readyok') {
        self.postMessage({ type: 'ready' });
      } else if (line.indexOf('info') === 0 && line.indexOf('score') !== -1) {
        var depthM = line.match(/depth (\d+)/);
        var cpM    = line.match(/score cp (-?\d+)/);
        var mateM  = line.match(/score mate (-?\d+)/);
        var ev = 0;
        if (cpM)   ev = parseInt(cpM[1]);
        if (mateM) ev = parseInt(mateM[1]) > 0 ? 9999 : -9999;
        self.postMessage({ type: 'info', payload: { depth: depthM ? parseInt(depthM[1]) : 0, evaluation: ev } });
      } else if (line.indexOf('bestmove') === 0) {
        var parts = line.split(' ');
        var bm = (parts[1] && parts[1] !== '(none)') ? parts[1] : null;
        self.postMessage({ type: 'bestmove', payload: { bestMove: bm } });
      }
    };

    engine.postMessage('uci');
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: String(err) } });
  }
}
