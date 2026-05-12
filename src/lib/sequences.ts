export interface Sequence {
  id: string
  title: string
  /** Starting FEN (usually standard position) */
  startFen: string
  /** FEN of the position after all opening moves — shown as the card thumbnail */
  fen: string
  /** UCI moves for the full opening line, both colors in order */
  moves: string[]
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

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const SEQUENCES: Sequence[] = [
  {
    id: 'sicilian',
    title: 'Sicilian Defense',
    startFen: STANDARD_FEN,
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4'],
    difficulty: 'beginner',
    danceDuration: '2:15',
  },
  {
    id: 'ruy-lopez',
    title: 'Ruy López',
    startFen: STANDARD_FEN,
    fen: 'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'],
    difficulty: 'beginner',
    danceDuration: '2:40',
  },
  {
    id: 'italian',
    title: 'Italian Game',
    startFen: STANDARD_FEN,
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'],
    difficulty: 'beginner',
    danceDuration: '2:05',
  },
  {
    id: 'queens-gambit',
    title: "Queen's Gambit",
    startFen: STANDARD_FEN,
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 1 4',
    moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'],
    difficulty: 'intermediate',
    danceDuration: '2:30',
  },
  {
    id: 'french',
    title: 'French Defense',
    startFen: STANDARD_FEN,
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 4',
    moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6'],
    difficulty: 'intermediate',
    danceDuration: '2:50',
  },
  {
    id: 'kings-indian',
    title: "King's Indian Defense",
    startFen: STANDARD_FEN,
    fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5',
    moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'],
    difficulty: 'advanced',
    danceDuration: '3:10',
  },
  {
    id: 'london',
    title: 'London System',
    startFen: STANDARD_FEN,
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3P1B2/4PN2/PPP2PPP/RN1QKB1R b KQkq - 0 4',
    moves: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4', 'e7e6'],
    difficulty: 'beginner',
    danceDuration: '2:20',
  },
  {
    id: 'nimzo-indian',
    title: 'Nimzo-Indian Defense',
    startFen: STANDARD_FEN,
    fen: 'rnbqk2r/pp1p1ppp/4pn2/2p5/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQkq - 0 5',
    moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'c7c5'],
    difficulty: 'advanced',
    danceDuration: '3:00',
  },
]
