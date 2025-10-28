# FretLab - Guitar Scale & Chord Explorer

An interactive web application for exploring guitar scales, chords, and fretboard patterns.

## Features

### Scale Visualization
- **Multiple Scale Types**: Major, minor, pentatonic, blues, and all 7 modes
- **All 6 Strings**: Full guitar fretboard (E, A, D, G, B, e)
- **21 Frets**: Complete neck visualization
- **Scale Degrees**: Toggle between note names and scale degrees
- **Root Note Highlighting**: Red marks the root, customizable colors

### Chord Analysis
- **Diatonic Chords**: Automatically generates triads and sevenths for any scale
- **Interactive Selection**: Click any chord to see its notes on the fretboard
- **Color-Coded**: Root, third, and other chord tones highlighted
- **Clear Selection**: Easy reset to view all scale notes

### Position System
- **5 Standard Positions**: View scale patterns in different neck positions
- **Position Labels**: Visual indicators for each position
- **Selective Display**: Focus on one position at a time
- **All Scale Types**: Patterns adapt to major, minor, pentatonic, and blues

### Customization
- **Dark/Light Mode**: Toggle between themes
- **Custom Colors**: Adjust root note and scale note colors
- **Responsive Design**: Works on desktop and tablet

## How to Use

1. Open `index.html` in any modern web browser
2. Select your **Root Note** (C, D, E, etc.)
3. Choose a **Scale Type** (Major, Minor, Pentatonic, etc.)
4. Explore the fretboard - click "Show Degrees" to see scale degrees
5. Click any chord in the chord list to highlight its notes
6. Toggle "Show Positions" to view different neck positions

## File Structure

```
guitar-scale/
├── index.html    # Standalone web application
└── README.md     # This file
```

## Deployment

This is a static website - no build process required!

### Host on GitHub Pages:
1. Push to a GitHub repository
2. Go to Settings → Pages
3. Select your branch
4. Your site will be live at `https://yourusername.github.io/repository-name/`

### Host on Netlify:
1. Sign up at netlify.com
2. Drag and drop the `guitar-scale` folder
3. Your site is live!

### Host anywhere:
Just upload the `index.html` file to any web server. It's completely self-contained.

## Browser Compatibility

Works in all modern browsers:
- Chrome
- Firefox
- Safari
- Edge
- Opera

## Technical Details

- **React 18**: Via CDN for component functionality
- **Tailwind CSS**: Via CDN for styling
- **No Build Process**: Pure HTML/JS - works anywhere
- **Babel Standalone**: In-browser JSX transformation
- **Font**: Inter (via Google Fonts)

## License

Free to use and modify. Share and enjoy!

