# 6×6 Go

Browser-only Go on a 6×6 board (six lines by six lines, 36 intersections). Black plays first. Open `index.html`. No server, no build step.

Nothing leaves the browser. Games, comments, and learning stats stay on this page. Stats are written to `localStorage` under the key **`go6x6.stats.v1`**.

## How to play

- Black first. Click an empty point to place a stone.
- Liberties are orthogonal. A group with no liberties is captured.
- Suicide is illegal unless the move captures.
- Simple ko: you may not immediately recapture the single stone that just captured.
- Pass. Two consecutive passes end the game.
- Score is Chinese-style: your stones plus empty points you surround. There is **no komi**.
- Coordinates: **A1** is bottom-left, **F6** is top-right.
- Last move is marked. Use **Pass** and **New game**.

## Self-play

Each color can be **Human** or **Machine**. That covers human vs human, human vs machine (either color), and machine vs machine.

- Changing Human / Machine takes effect on the next turn.
- Machine vs machine waits for **Start**. **Pause** stops the machines. The speed slider is the delay between machine moves (slow enough to read the comments).
- If only one side is the machine, it plays its turns on its own.

## Commentary

After every move, human or machine, the page adds one short line: the point and the strongest job of that move.

Jobs, strongest first: taking *N* stones; filling a last liberty; saving a one-liberty group; connecting; taking a side; or pass because no legal gain.

The game log scrolls. The latest line is also shown above the log.

## Learning stats

While both sides are machines, finished games update a table stored in this browser:

- Games finished, Black / White / even wins
- Average stones captured
- Which points were played in the first eight moves
- Win rate when a game’s first move was a given point
- A weight per intersection

After each finished self-play game, weights nudge up on points the winner played and down on points the loser played. The heat map is those weights (warm = preferred). The machine still only plays legal moves if the table is empty (cold start: heuristics plus a little noise).

**Reset stats** clears `go6x6.stats.v1`. Refresh keeps the stats; reset removes them. Human vs human and human vs machine games do not write this table.

## Files

Static files only: `index.html`, `rules.js`, `go.js`, `style.css`. `.nojekyll` is present for GitHub Pages.
