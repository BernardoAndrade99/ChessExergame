export interface Puzzle {
  id: string
  title: string
  description: string
  fen: string
  solution: string[]   // UCI moves e.g. ['d1h5', 'e8e7', 'h5e5']
  theme: string
  difficulty: 'easy' | 'medium' | 'hard'
  sideToMove: 'w' | 'b'
}

// ── Temporary test puzzle: white knight on e4 + bishop on d4, all 8 knight moves reachable ──
export const KNIGHT_BISHOP_TEST_PUZZLE: Puzzle = {
  id: 'test_kb',
  title: 'Knight & Bishop Test',
  description: 'White to move — test knight and bishop gestures from a central position.',
  fen: '4k3/8/8/8/2BN4/8/8/4K3 w - - 0 1',
  solution: ['e4f6'],
  theme: 'Test',
  difficulty: 'easy',
  sideToMove: 'w',
}

// Curated set of simple tactical puzzles for both sides
export const PUZZLES: Puzzle[] = [
  {
    id: 'p1',
    title: 'Scholar\'s Mate',
    description: 'White to move — deliver checkmate in 1.',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solution: ['d1h5'],
    theme: 'Checkmate in 1',
    difficulty: 'easy',
    sideToMove: 'w',
  },
  {
    id: 'p2',
    title: 'Back-Rank Mate',
    description: 'White to move — spot the back-rank weakness.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['a1a8'],
    theme: 'Back-rank Mate',
    difficulty: 'easy',
    sideToMove: 'w',
  },
  {
    id: 'p3',
    title: 'Fork of the Century',
    description: 'White Knight forks King and Queen — find it!',
    fen: 'r1b1k2r/pppp1ppp/8/4q3/2B5/5N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
    solution: ['f3e5'],
    theme: 'Fork',
    difficulty: 'easy',
    sideToMove: 'w',
  },
  {
    id: 'p4',
    title: 'Pin & Win',
    description: 'White to move — use the pin to win material.',
    fen: 'r2qk2r/ppp2ppp/2n5/3p4/3P4/5N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
    solution: ['f1b5'],
    theme: 'Pin',
    difficulty: 'medium',
    sideToMove: 'w',
  },
  {
    id: 'p5',
    title: 'Smothered Mate',
    description: 'White to move — the king cannot escape its own pieces.',
    fen: '6rk/5Npp/8/8/8/8/8/6K1 w - - 0 1',
    solution: ['f7h6'],
    theme: 'Smothered Mate',
    difficulty: 'medium',
    sideToMove: 'w',
  },
  {
    id: 'p6',
    title: 'Queen Sacrifice',
    description: 'Sacrifice the queen for checkmate — calculate carefully!',
    fen: 'r5rk/ppp2ppp/8/3Q4/3P4/8/PPP2PPP/R5K1 w - - 0 1',
    solution: ['d5h5'],
    theme: 'Queen Sacrifice',
    difficulty: 'hard',
    sideToMove: 'w',
  },
  {
    id: 'p7',
    title: 'Discovered Attack',
    description: 'Move one piece to unleash an attack from another.',
    fen: 'r1bqkb1r/ppp2ppp/2n5/3pN3/3P4/8/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    solution: ['e5c6'],
    theme: 'Discovered Attack',
    difficulty: 'medium',
    sideToMove: 'w',
  },
  {
    id: 'p8',
    title: 'Skewer',
    description: 'Attack the higher-value piece first, then take what\'s behind.',
    fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    solution: ['a1a8'],
    theme: 'Skewer',
    difficulty: 'easy',
    sideToMove: 'w',
  },
  {
    id: 'p9',
    title: 'Deflect the Checker',
    description: 'Black to move — capture the checking queen.',
    fen: '4k3/8/8/8/8/8/4Q3/3bK3 b - - 0 1',
    solution: ['d1e2'],
    theme: 'Defense',
    difficulty: 'easy',
    sideToMove: 'b',
  },
  {
    id: 'p10',
    title: 'Rook Cleanup',
    description: 'Black to move — remove the strongest attacker.',
    fen: '4k3/8/8/8/8/8/4Q3/4r1K1 b - - 0 1',
    solution: ['e1e2'],
    theme: 'Winning Material',
    difficulty: 'easy',
    sideToMove: 'b',
  },
  {
    id: 'p11',
    title: 'Knight Rescue',
    description: 'Black to move — use the knight to neutralize the threat.',
    fen: '4k3/8/8/8/8/2n5/4Q3/4K3 b - - 0 1',
    solution: ['c3e2'],
    theme: 'Defense',
    difficulty: 'medium',
    sideToMove: 'b',
  },
  {
    id: 'p12',
    title: 'Counterstrike',
    description: 'Black to move — win the rook with a precise queen move.',
    fen: '4k3/8/8/8/8/8/3R4/3qK3 b - - 0 1',
    solution: ['d1d2'],
    theme: 'Winning Material',
    difficulty: 'medium',
    sideToMove: 'b',
  },
]

export function getPuzzle(id: string): Puzzle | undefined {
  return PUZZLES.find(p => p.id === id)
}

export function getPuzzlesBySide(sideToMove?: Puzzle['sideToMove']): Puzzle[] {
  return sideToMove ? PUZZLES.filter(p => p.sideToMove === sideToMove) : PUZZLES
}

export function getRandomPuzzle(
  difficulty?: Puzzle['difficulty'],
  sideToMove?: Puzzle['sideToMove'],
): Puzzle {
  const byDifficulty = difficulty ? PUZZLES.filter(p => p.difficulty === difficulty) : PUZZLES
  const pool = sideToMove ? byDifficulty.filter(p => p.sideToMove === sideToMove) : byDifficulty
  if (pool.length === 0) return PUZZLES[0]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function getNextPuzzle(currentId: string, sideToMove?: Puzzle['sideToMove']): Puzzle {
  const pool = getPuzzlesBySide(sideToMove)
  const idx = pool.findIndex(p => p.id === currentId)
  if (idx < 0) return pool[0] ?? PUZZLES[0]
  return pool[(idx + 1) % pool.length]
}

export const DIFFICULTY_COLOR: Record<Puzzle['difficulty'], string> = {
  easy:   'var(--accent-emerald)',
  medium: 'var(--accent-gold)',
  hard:   'var(--accent-ruby)',
}
