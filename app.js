/* ============================================================
   Chord Library — app.js
   Pure vanilla JS, localStorage persistence, offline-ready
   ============================================================ */

'use strict';

// ── Chord definitions ──────────────────────────────────────
const CHORDS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_COUNT = CHORDS.length; // 12

/**
 * Transpose a single root chord string (e.g. "C#") by `steps` half-steps.
 * Returns the new chord string.
 */
function transposeChord(chord, steps) {
  const idx = CHORDS.indexOf(chord);
  if (idx === -1) return chord; // unknown chord, leave as-is
  return CHORDS[((idx + steps) % CHORD_COUNT + CHORD_COUNT) % CHORD_COUNT];
}

/**
 * Transpose a chord token that may include a bass note (slash chord),
 * e.g. "D/F#" → steps=1 → "D#/G".
 * Also handles simple chords: "Am" (only capital letter prefix is a chord).
 *
 * Only uppercase letters (optionally followed by '#') are treated as chord roots.
 * Lowercase suffixes (m, maj7, sus4, etc.) are preserved.
 */
function transposeToken(token, steps) {
  if (steps === 0) return token;

  /**
   * Parse a chord name like:
   *   C  →  root="C", suffix=""
   *   C# →  root="C#", suffix=""
   *   Am →  root="A", suffix="m"
   *   C#maj7 → root="C#", suffix="maj7"
   *   D/F#   → handled separately (slash chord)
   */
  function parseChord(str) {
    const match = str.match(/^([A-G]#?)(.*)/);
    if (!match) return null;
    return { root: match[1], suffix: match[2] };
  }

  if (token.includes('/')) {
    const [upper, lower] = token.split('/');
    const parsedUpper = parseChord(upper);
    const parsedLower = parseChord(lower);
    if (!parsedUpper) return token;
    const newUpper = transposeChord(parsedUpper.root, steps) + parsedUpper.suffix;
    const newLower = parsedLower
      ? transposeChord(parsedLower.root, steps) + parsedLower.suffix
      : lower;
    return newUpper + '/' + newLower;
  }

  const parsed = parseChord(token);
  if (!parsed) return token;
  return transposeChord(parsed.root, steps) + parsed.suffix;
}

/**
 * Transpose all chord tokens inside [brackets] in a lyrics/chord string.
 * Text outside brackets is left untouched.
 */
function transposeContent(content, steps) {
  if (steps === 0) return content;
  return content.replace(/\[([^\]]+)\]/g, (_, chord) => {
    return '[' + transposeToken(chord, steps) + ']';
  });
}

/**
 * Extract unique chord roots found in bracketed tokens (for card preview).
 */
function extractChords(content) {
  const seen = new Set();
  const result = [];
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const token = m[1];
    // handle slash chords
    const parts = token.split('/');
    for (const part of parts) {
      const match = part.match(/^([A-G]#?)/);
      if (match) {
        const root = match[1];
        if (!seen.has(root)) { seen.add(root); result.push(root); }
      }
    }
  }
  return result;
}

/**
 * Render bracketed chords as highlighted spans in the detail view.
 * Text outside brackets is rendered as plain text.
 */
function renderChordDisplay(content, steps) {
  const transposed = transposeContent(content, steps);
  // Replace [chord] with a highlighted span, escape HTML for the rest.
  const escaped = transposed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\[([^\]]+)\]/g, (_, chord) => {
    return `<span class="chord-token">${chord}</span>`;
  });
}

// ── Storage helpers ────────────────────────────────────────
const DB_KEY = 'chordLibraryDB';

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { songs: [], playlists: [] };
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── App State ──────────────────────────────────────────────
let db = loadDB();
let currentView = 'list'; // 'list' | 'detail'
let currentSongId = null;
let currentPlaylistId = null; // null = "All Songs"
let transposeDelta = 0; // current temporary transpose offset
let searchQuery = '';
let editingPlaylistId = null; // for rename

// ── DOM refs ───────────────────────────────────────────────
const sidebar           = document.getElementById('sidebar');
const sidebarToggle     = document.getElementById('sidebarToggle');
const themeToggle       = document.getElementById('themeToggle');
const playlistList      = document.getElementById('playlistList');
const addPlaylistBtn    = document.getElementById('addPlaylistBtn');
const allSongsBtn       = document.getElementById('allSongsBtn');
const topbarTitle       = document.getElementById('topbarTitle');
const searchInput       = document.getElementById('searchInput');
const addSongBtn        = document.getElementById('addSongBtn');

// Song list
const songListView      = document.getElementById('songListView');
const songGrid          = document.getElementById('songGrid');
const emptyState        = document.getElementById('emptyState');

// Song detail
const songDetailView    = document.getElementById('songDetailView');
const backBtn           = document.getElementById('backBtn');
const detailTitle       = document.getElementById('detailTitle');
const detailArtist      = document.getElementById('detailArtist');
const editSongBtn       = document.getElementById('editSongBtn');
const deleteSongBtn     = document.getElementById('deleteSongBtn');
const transposeDown     = document.getElementById('transposeDown');
const transposeUp       = document.getElementById('transposeUp');
const transposeValue    = document.getElementById('transposeValue');
const resetTranspose    = document.getElementById('resetTranspose');
const chordDisplay      = document.getElementById('chordDisplay');
const addToPlaylistBtn  = document.getElementById('addToPlaylistBtn');

// Song modal
const songModal         = document.getElementById('songModal');
const songModalTitle    = document.getElementById('songModalTitle');
const closeSongModal    = document.getElementById('closeSongModal');
const cancelSongModal   = document.getElementById('cancelSongModal');
const saveSongBtn       = document.getElementById('saveSongBtn');
const songTitleInput    = document.getElementById('songTitle');
const songArtistInput   = document.getElementById('songArtist');
const songKeyInput      = document.getElementById('songKey');
const songChordsInput   = document.getElementById('songChords');

// Playlist modal
const playlistModal       = document.getElementById('playlistModal');
const playlistModalTitle  = document.getElementById('playlistModalTitle');
const closePlaylistModal  = document.getElementById('closePlaylistModal');
const cancelPlaylistModal = document.getElementById('cancelPlaylistModal');
const savePlaylistBtn     = document.getElementById('savePlaylistBtn');
const playlistNameInput   = document.getElementById('playlistName');

// Add-to-playlist modal
const addToPlaylistModal       = document.getElementById('addToPlaylistModal');
const closeAddToPlaylistModal  = document.getElementById('closeAddToPlaylistModal');
const cancelAddToPlaylistModal = document.getElementById('cancelAddToPlaylistModal');
const playlistPickerList       = document.getElementById('playlistPickerList');
const noPlaylistsMsg           = document.getElementById('noPlaylistsMsg');

// Toast
const toast             = document.getElementById('toast');

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

// ── Theme ──────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ── Playlist rendering ─────────────────────────────────────
function renderPlaylists() {
  playlistList.innerHTML = '';
  db.playlists.forEach(pl => {
    const songCount = pl.songs ? pl.songs.length : 0;
    const li = document.createElement('li');
    li.className = 'playlist-item' + (currentPlaylistId === pl.id ? ' active' : '');
    li.dataset.id = pl.id;
    li.innerHTML = `
      <div class="playlist-item-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      </div>
      <span class="playlist-item-name">${escHtml(pl.name)}</span>
      <span class="playlist-item-count">${songCount}</span>
      <div class="playlist-item-actions">
        <button class="playlist-action-btn rename-pl" title="Rename" data-id="${pl.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="playlist-action-btn delete delete-pl" title="Delete" data-id="${pl.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>`;
    playlistList.appendChild(li);
  });

  // Active state for "All Songs"
  allSongsBtn.classList.toggle('active', currentPlaylistId === null);
}

// ── Song list rendering ────────────────────────────────────
function getVisibleSongs() {
  let songs = db.songs;

  if (currentPlaylistId !== null) {
    const pl = db.playlists.find(p => p.id === currentPlaylistId);
    if (pl) {
      songs = songs.filter(s => pl.songs && pl.songs.includes(s.id));
    } else {
      songs = [];
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    songs = songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q)
    );
  }

  return songs;
}

function renderSongGrid() {
  const songs = getVisibleSongs();
  songGrid.innerHTML = '';

  if (songs.length === 0) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  songs.forEach(song => {
    const chords = extractChords(song.chords || '');
    const card = document.createElement('div');
    card.className = 'song-card';
    card.dataset.id = song.id;
    card.innerHTML = `
      ${song.key ? `<div class="song-card-key">${escHtml(song.key)}</div>` : ''}
      <div class="song-card-title">${escHtml(song.title)}</div>
      <div class="song-card-artist">${escHtml(song.artist || '—')}</div>
      <div class="song-card-chords">
        ${chords.slice(0, 8).map(c => `<span class="chord-pill">${escHtml(c)}</span>`).join('')}
        ${chords.length > 8 ? `<span class="chord-pill">+${chords.length - 8}</span>` : ''}
      </div>`;
    songGrid.appendChild(card);
  });
}

function showSongList() {
  currentView = 'list';
  songListView.classList.remove('hidden');
  songDetailView.classList.add('hidden');
  renderSongGrid();
}

function showSongDetail(songId) {
  const song = db.songs.find(s => s.id === songId);
  if (!song) return;
  currentSongId = songId;
  transposeDelta = 0;
  currentView = 'detail';

  detailTitle.textContent = song.title;
  detailArtist.textContent = song.artist || '';
  transposeValue.textContent = '0';
  renderChordContent(song);

  songListView.classList.add('hidden');
  songDetailView.classList.remove('hidden');
}

function renderChordContent(song) {
  const s = song || db.songs.find(s => s.id === currentSongId);
  if (!s) return;
  chordDisplay.innerHTML = renderChordDisplay(s.chords || '', transposeDelta);
}

// ── Song CRUD ──────────────────────────────────────────────
let editingSongId = null;

function openSongModal(songId = null) {
  editingSongId = songId;
  if (songId) {
    const song = db.songs.find(s => s.id === songId);
    if (!song) return;
    songModalTitle.textContent = 'Edit Song';
    songTitleInput.value = song.title;
    songArtistInput.value = song.artist || '';
    songKeyInput.value = song.key || '';
    songChordsInput.value = song.chords || '';
  } else {
    songModalTitle.textContent = 'Add Song';
    songTitleInput.value = '';
    songArtistInput.value = '';
    songKeyInput.value = '';
    songChordsInput.value = '';
  }
  openModal(songModal);
  setTimeout(() => songTitleInput.focus(), 50);
}

function saveSong() {
  const title = songTitleInput.value.trim();
  if (!title) { songTitleInput.focus(); showToast('Song title is required', 'error'); return; }

  const data = {
    title,
    artist: songArtistInput.value.trim(),
    key: songKeyInput.value.trim(),
    chords: songChordsInput.value,
  };

  if (editingSongId) {
    const idx = db.songs.findIndex(s => s.id === editingSongId);
    if (idx !== -1) db.songs[idx] = { ...db.songs[idx], ...data };
    showToast('Song updated', 'success');
  } else {
    const newSong = { id: generateId(), ...data };
    db.songs.push(newSong);

    // If we're in a playlist view, add to that playlist
    if (currentPlaylistId) {
      const pl = db.playlists.find(p => p.id === currentPlaylistId);
      if (pl) { pl.songs = pl.songs || []; pl.songs.push(newSong.id); }
    }
    showToast('Song added', 'success');
  }

  saveDB(db);
  closeModal(songModal);
  renderPlaylists();

  if (currentView === 'detail' && editingSongId === currentSongId) {
    const song = db.songs.find(s => s.id === currentSongId);
    if (song) {
      detailTitle.textContent = song.title;
      detailArtist.textContent = song.artist || '';
      renderChordContent(song);
    }
  } else {
    renderSongGrid();
  }
}

function deleteSong(songId) {
  if (!confirm('Delete this song? This cannot be undone.')) return;
  db.songs = db.songs.filter(s => s.id !== songId);
  // Remove from all playlists
  db.playlists.forEach(pl => {
    pl.songs = (pl.songs || []).filter(id => id !== songId);
  });
  saveDB(db);
  showToast('Song deleted');
  renderPlaylists();
  showSongList();
}

// ── Playlist CRUD ──────────────────────────────────────────
function openPlaylistModal(playlistId = null) {
  editingPlaylistId = playlistId;
  if (playlistId) {
    const pl = db.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    playlistModalTitle.textContent = 'Rename Playlist';
    playlistNameInput.value = pl.name;
  } else {
    playlistModalTitle.textContent = 'New Playlist';
    playlistNameInput.value = '';
  }
  openModal(playlistModal);
  setTimeout(() => playlistNameInput.focus(), 50);
}

function savePlaylist() {
  const name = playlistNameInput.value.trim();
  if (!name) { playlistNameInput.focus(); showToast('Playlist name is required', 'error'); return; }

  if (editingPlaylistId) {
    const pl = db.playlists.find(p => p.id === editingPlaylistId);
    if (pl) pl.name = name;
    showToast('Playlist renamed', 'success');
  } else {
    db.playlists.push({ id: generateId(), name, songs: [] });
    showToast('Playlist created', 'success');
  }

  saveDB(db);
  closeModal(playlistModal);
  renderPlaylists();
  updateTopbarTitle();
}

function deletePlaylist(playlistId) {
  if (!confirm('Delete this playlist? Songs will not be removed.')) return;
  db.playlists = db.playlists.filter(p => p.id !== playlistId);
  saveDB(db);
  if (currentPlaylistId === playlistId) {
    currentPlaylistId = null;
    updateTopbarTitle();
    showSongList();
  }
  renderPlaylists();
  showToast('Playlist deleted');
}

function selectPlaylist(playlistId) {
  currentPlaylistId = playlistId;
  renderPlaylists();
  updateTopbarTitle();
  showSongList();
}

function updateTopbarTitle() {
  if (currentPlaylistId === null) {
    topbarTitle.textContent = 'All Songs';
  } else {
    const pl = db.playlists.find(p => p.id === currentPlaylistId);
    topbarTitle.textContent = pl ? pl.name : 'All Songs';
  }
}

// ── Add to Playlist ────────────────────────────────────────
function openAddToPlaylistModal() {
  playlistPickerList.innerHTML = '';
  if (db.playlists.length === 0) {
    noPlaylistsMsg.style.display = '';
    openModal(addToPlaylistModal);
    return;
  }
  noPlaylistsMsg.style.display = 'none';

  const currentPl = db.playlists.find(p => p.id === currentPlaylistId);
  db.playlists.forEach(pl => {
    const alreadyIn = (pl.songs || []).includes(currentSongId);
    const item = document.createElement('div');
    item.className = 'playlist-picker-item' + (alreadyIn ? ' already-added' : '');
    item.innerHTML = `
      <span>${escHtml(pl.name)}</span>
      <span style="font-size:0.75rem;color:var(--text-3)">${alreadyIn ? '✓ Added' : (pl.songs || []).length + ' songs'}</span>`;
    if (!alreadyIn) {
      item.addEventListener('click', () => {
        pl.songs = pl.songs || [];
        pl.songs.push(currentSongId);
        saveDB(db);
        renderPlaylists();
        showToast(`Added to "${pl.name}"`, 'success');
        closeModal(addToPlaylistModal);
      });
    }
    playlistPickerList.appendChild(item);
  });
  openModal(addToPlaylistModal);
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(el) { el.classList.add('active'); }
function closeModal(el) { el.classList.remove('active'); }

// Close modal on overlay click
[songModal, playlistModal, addToPlaylistModal].forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal);
  });
});

// ── HTML escape ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event Listeners ────────────────────────────────────────

// Sidebar toggle
sidebarToggle.addEventListener('click', () => {
  if (window.innerWidth <= 640) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
});

// Theme
themeToggle.addEventListener('click', toggleTheme);

// All Songs
allSongsBtn.addEventListener('click', () => {
  currentPlaylistId = null;
  renderPlaylists();
  updateTopbarTitle();
  showSongList();
});

// Playlist actions (event delegation)
playlistList.addEventListener('click', e => {
  const renameBtn = e.target.closest('.rename-pl');
  const deleteBtn = e.target.closest('.delete-pl');
  const item = e.target.closest('.playlist-item');

  if (renameBtn) {
    e.stopPropagation();
    openPlaylistModal(renameBtn.dataset.id);
    return;
  }
  if (deleteBtn) {
    e.stopPropagation();
    deletePlaylist(deleteBtn.dataset.id);
    return;
  }
  if (item) {
    selectPlaylist(item.dataset.id);
  }
});

// Add playlist
addPlaylistBtn.addEventListener('click', () => openPlaylistModal(null));

// Search
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  if (currentView === 'list') renderSongGrid();
});

// Add song
addSongBtn.addEventListener('click', () => openSongModal(null));

// Song card click (event delegation)
songGrid.addEventListener('click', e => {
  const card = e.target.closest('.song-card');
  if (card) showSongDetail(card.dataset.id);
});

// Song detail back
backBtn.addEventListener('click', showSongList);

// Edit / Delete song from detail
editSongBtn.addEventListener('click', () => openSongModal(currentSongId));
deleteSongBtn.addEventListener('click', () => deleteSong(currentSongId));

/** Normalise a transpose delta into [0, CHORD_COUNT). */
function normalizeTranspose(delta) {
  return ((delta % CHORD_COUNT) + CHORD_COUNT) % CHORD_COUNT;
}

/** Format the stored [0,11] delta as a signed integer in the range -6..+6. */
function formatTransposeDisplay(delta) {
  const value = delta > 6 ? delta - CHORD_COUNT : delta;
  return value > 0 ? '+' + value : String(value);
}

// Transpose
transposeDown.addEventListener('click', () => {
  transposeDelta = normalizeTranspose(transposeDelta - 1);
  transposeValue.textContent = formatTransposeDisplay(transposeDelta);
  renderChordContent();
});

transposeUp.addEventListener('click', () => {
  transposeDelta = normalizeTranspose(transposeDelta + 1);
  transposeValue.textContent = formatTransposeDisplay(transposeDelta);
  renderChordContent();
});

resetTranspose.addEventListener('click', () => {
  transposeDelta = 0;
  transposeValue.textContent = '0';
  renderChordContent();
});

// Song modal buttons
closeSongModal.addEventListener('click', () => closeModal(songModal));
cancelSongModal.addEventListener('click', () => closeModal(songModal));
saveSongBtn.addEventListener('click', saveSong);

// Playlist modal buttons
closePlaylistModal.addEventListener('click', () => closeModal(playlistModal));
cancelPlaylistModal.addEventListener('click', () => closeModal(playlistModal));
savePlaylistBtn.addEventListener('click', savePlaylist);

// Add to playlist buttons
addToPlaylistBtn.addEventListener('click', openAddToPlaylistModal);
closeAddToPlaylistModal.addEventListener('click', () => closeModal(addToPlaylistModal));
cancelAddToPlaylistModal.addEventListener('click', () => closeModal(addToPlaylistModal));

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    [songModal, playlistModal, addToPlaylistModal].forEach(closeModal);
    return;
  }
  // Submit on Enter in text inputs (not textarea)
  if (e.key === 'Enter') {
    if (document.activeElement === playlistNameInput) { savePlaylist(); return; }
    if (document.activeElement === songTitleInput ||
        document.activeElement === songArtistInput ||
        document.activeElement === songKeyInput) { saveSong(); return; }
  }
});

// ── Init ───────────────────────────────────────────────────
initTheme();
renderPlaylists();
showSongList();
