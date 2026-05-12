export interface Sequence {
  id: string
  title: string
  /** FEN of the position after all opening moves — shown as the card thumbnail */
  fen: string
  /** Total number of half-moves (plies) in the sequence */
  moveCount: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  /** Estimated active-movement duration, e.g. "2:15" */
  danceDuration: string
}

export const DIFFICULTY_LABEL: Record<Sequence['difficulty'], string> = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
}

export const DIFFICULTY_COLOR: Record<Sequence['difficulty'], string> = {
  beginner:     '#10b981',   // emerald
  intermediate: '#f59e0b',   // gold
  advanced:     '#ef4444',   // ruby
}

export const SEQUENCES: Sequence[] = [
  {
    id: 'sicilian',
    title: 'Sicilian Defense',
    fen: 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4',
    moveCount: 6,
    difficulty: 'beginner',
    danceDuration: '2:15',
  },
  {
    id: 'ruy-lopez',
    title: 'Ruy López',
    fen: 'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4',
    moveCount: 7,
    difficulty: 'beginner',
    danceDuration: '2:40',
  },
  {
    id: 'italian',
    title: 'Italian Game',
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
    moveCount: 6,
    difficulty: 'beginner',
    danceDuration: '2:05',
  },
  {
    id: 'queens-gambit',
    title: "Queen's Gambit",
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 1 4',
    moveCount: 6,
    difficulty: 'intermediate',
    danceDuration: '2:30',
  },
  {
    id: 'french',
    title: 'French Defense',
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p2B1/3PP3/2N5/PPP2PPP/R2QKBNR b KQkq - 1 4',
    moveCount: 7,
    difficulty: 'intermediate',
    danceDuration: '2:50',
  },
  {
    id: 'kings-indian',
    title: "King's Indian Defense",
    fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5',
    moveCount: 8,
    difficulty: 'advanced',
    danceDuration: '3:10',
  },
  {
    id: 'london',
    title: 'London System',
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3P1B2/4P3/PPP2PPP/RN1QKBNR w KQkq - 0 4',
    moveCount: 6,
    difficulty: 'beginner',
    danceDuration: '2:20',
  },
  {
    id: 'nimzo-indian',
    title: 'Nimzo-Indian Defense',
    fen: 'rnbqk2r/pp1p1ppp/4pn2/2p5/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQkq - 0 5',
    moveCount: 8,
    difficulty: 'advanced',
    danceDuration: '3:00',
  },
]
