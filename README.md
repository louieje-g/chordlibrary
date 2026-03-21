# Chord Library

A mobile-first offline chord library web application for musicians. Store, organize, and transpose your chord sheets with ease.

## Features

- **Song Management**: Add, edit, and delete songs with lyrics and chords
- **Chord Transposition**: Transpose songs up or down by semitones with working transpose and reset buttons
- **Chord Highlighting**: Automatic highlighting of recognized chord patterns
- **Playlists**: Create playlists to organize songs for performances
- **Playlist Navigation**: Navigate between songs in a playlist using left/right buttons
- **Mobile Swipe**: Swipe left/right on mobile to navigate songs in a playlist
- **Mobile-First Design**: Optimized for mobile devices with responsive layout
- **Offline Storage**: All data stored locally using localStorage
- **Search**: Filter songs by title or artist

## Usage

Simply open `index.html` in a web browser. No build step required.

### Quick Start

```bash
# Option 1: Open directly
open index.html

# Option 2: Use a local server
python -m http.server 8000
# Then visit http://localhost:8000
```

### Navigation

1. **Add Songs**: Click the "+" button in the header
2. **View Song**: Tap on a song in the sidebar list
3. **Transpose**: Use "−" and "+" buttons to transpose, "Reset" to return to original key
4. **Create Playlist**: Go to the Playlists tab, click "+ New Playlist"
5. **Add Songs to Playlist**: Open a playlist and click "+ Add Songs"
6. **Navigate Playlist Songs**: Use "‹" and "›" buttons or swipe left/right on mobile

## Supported Chords

The application recognizes and transposes standard chord notation:
- Root notes: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
- Qualities: m, maj, maj7, min, dim, aug, sus2, sus4, add9, 7, etc.
- Slash chords: D/F#, Am/G, etc.

## Browser Support

Modern browsers with ES6+ support (Chrome, Firefox, Safari, Edge)