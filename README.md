# ♟️ ChessExergame

A gesture-controlled chess exergame that uses your **webcam** and **hand tracking** (MediaPipe) to let you play chess with physical movements. Built with React, TypeScript, and Vite.

---

## 🖥️ Prerequisites

Before you start, make sure you have the following installed:

1. **Node.js** (version 18 or higher recommended)
   - Download from: https://nodejs.org/
   - To check if already installed, open a terminal and run:
     ```bash
     node -v
     ```

2. **npm** (comes bundled with Node.js)
   - To verify:
     ```bash
     npm -v
     ```

3. **A modern browser** with camera support (Chrome or Edge recommended)

4. **A webcam** — required for hand gesture tracking

---

## 🚀 Getting Started

### 1. Clone or copy the project

If you're getting this from Git:
```bash
git clone <repository-url>
cd ChessExergame
```

Or just copy the project folder to your PC.

### 2. Install dependencies

Open a terminal **inside the project folder** and run:
```bash
npm install
```

This will download all required packages (React, MediaPipe, chess.js, Stockfish, etc.).

> ⚠️ This may take a minute or two on the first run.

### 3. Start the development server

```bash
npm run dev
```

You should see output like:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### 4. Open the app

Open your browser and go to:
```
http://localhost:5173
```

> 🎥 When prompted, **allow camera access** — it is required for hand tracking to work.

---

## 📦 Tech Stack

| Package | Purpose |
|---|---|
| React + TypeScript | UI framework |
| Vite | Build tool & dev server |
| MediaPipe Tasks Vision | Hand & pose gesture tracking |
| chess.js | Chess logic and move validation |
| Stockfish | Chess AI engine |
| Zustand | State management |

---

## 🎮 How to Play

- Use your **hands in front of the webcam** to control the game
- Different hand gestures correspond to different chess pieces and actions
- Follow the on-screen HUD for guidance

---

## 🛑 Stopping the Server

Press `Ctrl + C` in the terminal where `npm run dev` is running.

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| `node` not found | Install Node.js from https://nodejs.org |
| Camera not working | Allow camera permissions in the browser, make sure no other app is using it |
| Page won't load | Make sure `npm run dev` is still running in the terminal |
| Gestures not detected | Ensure good lighting and keep your hands visible to the camera |
