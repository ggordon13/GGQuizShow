# GG Quiz Show

A live, Kahoot-style quiz game. One host projects the game on a big screen, and up to **150 players** (configurable) join from their phones with a 6-digit PIN or a QR code. Answer fast and answer right to score the most points.

- **Client:** React 19 + Vite, GSAP for UI motion, three.js for the 3D background and podium confetti
- **Server:** Node + Express + Socket.IO. The server owns all timing and scoring, so players can't cheat.

## Quick start

```bash
npm install
npm run dev
```

- Host: open http://localhost:5173/host, pick a quiz, and press **▶ Host**.
- Players: open the "Join at" address shown on the host screen (your LAN IP) or scan the QR code. Phones must be on the same Wi-Fi network.

### Production

```bash
npm run build   # builds the React app into client/dist
npm start       # Node serves the app and the game on port 3001
```

| Env var       | Default | Purpose                                        |
| ------------- | ------- | ---------------------------------------------- |
| `PORT`        | `3001`  | HTTP port                                      |
| `MAX_PLAYERS` | `150`   | Player cap per game                            |
| `CORS_ORIGIN` | —       | Comma-separated origins, if the client is hosted elsewhere |
| `RESULTS_DIR` | `server/data/results` | Where finished games are saved |

Games live in server memory, so run a **single** server instance. If you scale out, you'll need a Socket.IO adapter (e.g. Redis) and shared game state.

## How scoring works

Scoring follows Kahoot's formula (see [server/src/scoring.js](server/src/scoring.js)):

```
points = round(1000 × (1 − (responseTime ÷ timeLimit) ÷ 2) × multiplier)
```

- An instant correct answer scores **1000**; a correct answer at the buzzer scores **500**. Wrong or missing answers score **0**.
- `multiplier` is set per question: Standard (×1), Double points (×2) or No points (×0).
- **Answer streaks:** each consecutive correct answer after the first adds +100, up to +500.
- Response time is measured **on the server** from the moment answers open, so network lag and device clocks don't matter.
- Equal scores share a rank (1, 2, 2, 4).

## Saved results

Every game is saved automatically when it reaches the podium. A game the host ends early is saved too, with the questions scored so far. Each game produces two files in `RESULTS_DIR`:

- `2026-10-15T18-30-05-my-quiz-123456.csv`: one row per player with rank, nickname, score, number correct, average answer time, and points per question (`0` = wrong, blank = no answer). Opens directly in Excel or Google Sheets.
- `…json`: the same data plus every question, its answers, and each player's chosen answer and response time.

The host can also download the CSV at any time: **⬇ Results** in the top bar during the game, or **Download results (CSV)** on the podium.

Players who leave or are removed before the end aren't included. Saving needs a writable disk: on a laptop this just works. On cloud hosts the disk is often wiped on redeploy (e.g. Railway, Render), so attach a persistent volume and point `RESULTS_DIR` at it, or rely on the CSV download.

## Game flow

`lobby → intro (5s, question shown) → question (answering) → reveal → scoreboard → … → podium`

- A question ends early once every connected player has answered.
- The host can skip ahead, lock the lobby, remove players (click a name), or end the game at any time.
- Players can join mid-game.
- Refreshing is safe: hosts and players reconnect to their game automatically.

## Quizzes

Quizzes are built in the browser editor and saved to the host's `localStorage`. You can export and import them as JSON:

```json
{
  "title": "My quiz",
  "questions": [
    {
      "text": "What is 2 + 2?",
      "timeLimit": 20,
      "points": 1,
      "answers": [
        { "text": "3" },
        { "text": "4", "correct": true },
        { "text": "5" }
      ]
    }
  ]
}
```

Each question has 2–4 answers, at least one marked correct, and a 5–240 second time limit.

### Question images

Each question can have a reference image. In the editor, click the image area to browse, drag a file onto it, or paste a screenshot (Ctrl+V). Images are resized to at most 1280px and compressed to WebP (JPEG on browsers without WebP encoding), usually 50–400 KB. Animated GIFs become still images.

- Images are stored in the host browser's IndexedDB; the quiz in `localStorage` refers to them by id. Exported JSON includes images as `"image": "data:image/webp;base64,..."`, so importing on another computer brings them along.
- When a game is created, images are uploaded with the quiz and kept in server memory. Phones load each one from `/api/media/<pin>/<question>` when that question starts. Images for upcoming questions return 404, so players can't peek ahead.
- The image appears on the host screen and on phones during the intro and while answering. Players can tap it to view it full screen.
- Limits: 1.5 MB per image and 25 MB per quiz on the server (the editor's compression keeps you far below these). JPEG, PNG, WebP and GIF are accepted; SVG isn't, because it can contain scripts.

## Testing

```bash
npm test          # unit tests: scoring, game rules, validation
npm run loadtest  # 150 simulated players play a full game over real WebSockets
PLAYERS=300 npm run loadtest
```

## Project layout

```
server/src/
  index.js      Express + Socket.IO bootstrap, serves client/dist in production
  sockets.js    socket events, rooms, reconnects, rate limiting, cleanup of abandoned games
  game.js       game state machine and per-role views (pure logic, no sockets)
  scoring.js    points formula
  results.js    results snapshot, CSV export, saving to disk
  quiz.js       validation of host-submitted quizzes
client/src/
  App.jsx       routing between home / host / player
  three/        Background3D (floating answer shapes) and Confetti3D
  host/         quiz library, editor, and the projected game screens
  player/       phone screens: join, answer pad, results, final placing
  lib/          socket client, hooks, quiz storage
```
