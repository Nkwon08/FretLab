# FretLab

**An interactive guitar practice studio that runs entirely in your browser** — explore scales and chords on a full fretboard, tune your guitar, and record practice loops. No installs, no accounts, no build step.

![FretLab fretboard explorer](docs/fretboard.png)

## Features

### 🎸 Fretboard Explorer
- **12 scale types** — major, natural/harmonic/melodic minor, both pentatonics, blues, and all seven modes
- **Full neck view** — all 6 strings and 21 frets, with an adjustable fret-range selector
- **Notes or degrees** — toggle between note names and scale degrees (with ♭/♯ markings)
- **Diatonic chords** — triads and sevenths generated for any scale; click a chord to highlight its tones on the neck, color-coded by root, third, and other chord tones
- **Draw & save** — mark positions or licks directly on the fretboard, then name and save them for later
- **Built-in metronome** — 20–300 BPM click track while you practice
- **Custom colors** — pick your own root and scale-note colors; note labels adapt for contrast

### 🎯 Chromatic Tuner
- Pitch detection through your microphone (autocorrelation with smoothing)
- **Auto string detect** — play a string and the tuner figures out which one you're tuning
- Visual headstock with per-string reference tones, needle display, and cents readout
- Tuning presets: Standard, Drop D, and Half-step Down

![Tuner](docs/tuner.png)

### 🔁 Jam Mode
- Record loops with your microphone over a click track, with a one-bar count-in
- **Automatic quantization** — recordings are trimmed to the beat grid and crossfaded for seamless looping
- Waveform editor with draggable trim handles, playback indicator, and undo
- Pick a key and chord progression (I–V–vi–IV, ii–V–I, and more) to jam over
- Save loops to your browser (IndexedDB) and reload them anytime

![Jam Mode](docs/jam-mode.png)

## Getting Started

FretLab is a single self-contained HTML file.

```bash
git clone https://github.com/Nkwon08/FretLab.git
cd FretLab
python3 -m http.server 8000   # or any static file server
```

Then open <http://localhost:8000>.

> **Note:** serving over HTTP(S) (rather than opening the file directly) is recommended so the tuner's string samples load and the browser grants microphone access. The Tuner and Jam Mode need a microphone; everything else works without one.

### Deploying

It's a static site — host it anywhere:

- **GitHub Pages** — Settings → Pages → deploy from your branch
- **Netlify / Vercel / Cloudflare Pages** — point at the repo root, no build command needed
- **Any web server** — upload `index.html` and the `assets/` folder

## Project Structure

```
FretLab/
├── index.html          # The entire application (React via CDN)
├── assets/
│   └── samples/
│       └── standard/   # Open-string audio samples for the tuner
├── docs/               # README screenshots
└── LICENSE             # MIT
```

## Tech Stack

- **React 18** (production build via CDN) with in-browser JSX via Babel Standalone
- **Tailwind CSS** (Play CDN) for styling
- **Web Audio API** — metronome, pitch detection, loop quantization, and synthesized string plucks
- **MediaRecorder API** — loop recording
- **IndexedDB** — persistent loop storage

No bundler, no dependencies to install — the whole app ships as one HTML file.

## Browser Support

Works in current versions of Chrome, Edge, Firefox, Safari, and Opera. Microphone features require a secure context (HTTPS or `localhost`).

## License

[MIT](LICENSE) © Nathan Kwon
