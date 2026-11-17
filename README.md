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

### 🔁 Jam Mode — Mini DAW
- Opens directly into a multitrack recording timeline, starting with one guitar layer
- Select an audio interface/input channel and output device in **Audio settings** (output selection depends on browser support)
- Record dry mono guitar while existing tracks play, then add more recording layers
- Move waveform clips, trim either edge, split at the playhead, delete clips, and undo edits
- Cursor-anchored timeline zoom, per-track height zoom, beat snapping, mute/level controls, and loop playback
- Beat-locked **Repitch warping** with editable sample-to-beat markers; natural-rate audio when Warp is off
- Save/restore a session in this browser, import audio or old saved loops, and export a stereo WAV mix
- See [studio usage and limitations](docs/jam-mode.md)

## Getting Started

FretLab is a static app with no build step. Serve the repository root, including the `assets/` folder.

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
├── index.html          # App shell and practice tools (React via CDN)
├── assets/
│   ├── js/             # Mini DAW, audio engine, and capture worklet
│   └── samples/
│       └── standard/   # Open-string audio samples for the tuner
├── docs/               # README screenshots
└── LICENSE             # MIT
```

## Tech Stack

- **React 18** (production build via CDN) with in-browser JSX via Babel Standalone
- **Tailwind CSS** (Play CDN) for styling
- **Web Audio API** — metronome, pitch detection, loop quantization, and synthesized string plucks
- **AudioWorklet** — PCM recording on the playback sample clock
- **IndexedDB** — persistent loop storage

No bundler, no dependencies to install — serve the HTML and assets together.

## Browser Support

Works in current versions of Chrome, Edge, Firefox, Safari, and Opera. Microphone features require a secure context (HTTPS or `localhost`).

## License

[MIT](LICENSE) © Nathan Kwon
