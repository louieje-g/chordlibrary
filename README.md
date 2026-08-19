# Chord Library

A mobile-first offline chord library web application for musicians. Store, organize, and transpose your chord sheets with ease.

## Features

- **Song Management**: Add, edit, and delete songs with lyrics and chords
- **Inline Chord Editing**: Edit the chord sheet directly with real-time chord and section styling, plus save and discard protection
- **Chord Transposition**: Transpose songs up or down by semitones (±11 limit) with persistent per-song values
- **Chord Highlighting**: Automatic highlighting of sharp and flat chord patterns
- **Flat Chord Support**: Recognition and transposition of flat chords (Bb, Eb, etc.) using standard #/b characters
- **Key Display**: Auto-detected key shown and updated when transposing
- **Two-Column View**: Display long chord sheets in two balanced columns with a persistent per-song setting
- **Adjustable Font Size**: Resize chord sheets from 8px to 30px for different screens and viewing distances
- **Playlists**: Build performance setlists with a clear summary, guided empty state, and accessible song controls
- **Playlist Reorder**: Drag-and-drop song ordering within playlists
- **Playlist Navigation**: Swipe left/right or use arrow keys to navigate songs in a playlist
- **Library Drawer**: Searchable song and playlist collections with counts, update context, and quick-create actions
- **Home Dashboard**: A prominent “Jump back in” view with recent songs, playlists, update times, and quick access to full lists
- **Preferences**: Theme (dark/light) and chord notation (original/sharp/flat) settings
- **Smart QR Sharing**: Compressed QR codes that strip lyrics for easier scanning
- **Firebase Sync**: Optional Google sign-in for cross-device sync via Firestore
- **Import/Export**: Full data backup, single song export, QR code import
- **Mobile-First Design**: Optimized for mobile devices with responsive layout
- **Offline Storage**: Full PWA with service worker for offline use
- **Search**: Filter songs by title, artist, or content
- **Feature Tour**: "What's New" overlay that only presents features the user has not already seen

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
