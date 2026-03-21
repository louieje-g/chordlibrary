'use strict';

// ─── Chromatic scale (sharps only, as per spec) ──────────────────────────────
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const STORAGE_KEY = 'chord-library-songs';

// ─── Chord regex ─────────────────────────────────────────────────────────────
//
// Matches chord tokens of the form:   ROOT [QUALITY] [/ BASS]
//
// Capture groups:
//   1. ROOT    — [A-G] with optional #  (C C# D D# E F F# G G# A A# B)
//   2. QUALITY — recognised prefix (m/maj/min/dim/aug/sus/add or digit)
//                followed by any lowercase-alphanum continuation.
//                Restricting to known prefixes prevents swallowing plain words
//                (e.g. "D" in "Diminished" is NOT transposed).
//   3. SLASH   — optional bass note after "/" (e.g. "/F#" in "D/F#")
//
// Boundary guards:
//   (?<![A-Za-z])      — root must NOT be preceded by another letter
//   (?![a-zA-Z0-9#])   — match must NOT be followed by letter / digit / #
//
const QUALITY = '(?:m(?:aj)?|M(?:aj)?|min|dim|aug|sus[24]?|add|\\d)[a-z0-9]*';
const CHORD_RE = () =>
  new RegExp(
    `(?<![A-Za-z])([A-G]#?)(${QUALITY})?(\\/[A-G]#?(?:${QUALITY})?)?(?![a-zA-Z0-9#])`,
    'g'
  );

// ─── Music helpers ────────────────────────────────────────────────────────────

function transposeNote(note, steps) {
  const i = NOTES.indexOf(note);
  if (i === -1) return note;
  return NOTES[((i + steps) % 12 + 12) % 12];
}

/**
 * Transpose all chord tokens in free-form text by `steps` semitones.
 * Non-chord words (lyrics, section labels, etc.) are left untouched.
 */
function transposeText(text, steps) {
  if (!text || steps === 0) return text || '';
  return text.replace(CHORD_RE(), (_, root, quality, slash) => {
    const newRoot = transposeNote(root, steps);
    let result = newRoot + (quality || '');
    if (slash) {
      // slash is e.g. "/F#" or "/F#m"
      const m = slash.match(/^\/([A-G]#?)(.*)/s);
      if (m) {
        result += '/' + transposeNote(m[1], steps) + (m[2] || '');
      } else {
        result += slash;
      }
    }
    return result;
  });
}

/**
 * Build innerHTML for the chords display:
 * Escape HTML entities, then wrap each recognised chord token in a <span>.
 */
function buildChordsHtml(text) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe.replace(CHORD_RE(), m => `<span class="chord">${m}</span>`);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function persistSongs(songs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return Date.now().toString(36) + Math.random().toString(36).slice(2) +
         Math.random().toString(36).slice(2);
}

// ─── App state ────────────────────────────────────────────────────────────────

let songs          = loadSongs();
let selectedId     = null;
let transposeSteps = 0;
let editingId      = null;      // id being edited in modal; null = new song

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const dom = {
  songList:       $('song-list'),
  emptyMsg:       $('empty-message'),
  noSelection:    $('no-selection'),
  songDetail:     $('song-detail'),
  detailTitle:    $('detail-title'),
  detailArtist:   $('detail-artist'),
  chordsDisplay:  $('chords-display'),
  transposeValue: $('transpose-value'),
  transposeHint:  $('transpose-hint'),
  searchInput:    $('search-input'),
  modalOverlay:   $('modal-overlay'),
  modalTitle:     $('modal-title'),
  songForm:       $('song-form'),
  formTitle:      $('form-title'),
  formArtist:     $('form-artist'),
  formChords:     $('form-chords'),
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderSongList() {
  const query = dom.searchInput.value.trim().toLowerCase();
  const visible = query
    ? songs.filter(s =>
        s.title.toLowerCase().includes(query) ||
        (s.artist && s.artist.toLowerCase().includes(query)))
    : songs;

  dom.songList.innerHTML = '';

  if (visible.length === 0) {
    dom.emptyMsg.style.display = 'block';
    dom.emptyMsg.innerHTML = query
      ? 'No songs match your search.'
      : 'No songs yet.<br>Add your first song!';
    return;
  }

  dom.emptyMsg.style.display = 'none';

  visible.forEach(song => {
    const li = document.createElement('li');
    li.className = 'song-item' + (song.id === selectedId ? ' active' : '');
    li.innerHTML =
      `<div class="song-item-title">${escapeHtml(song.title)}</div>` +
      (song.artist
        ? `<div class="song-item-artist">${escapeHtml(song.artist)}</div>`
        : '');
    li.addEventListener('click', () => selectSong(song.id));
    dom.songList.appendChild(li);
  });
}

function renderSongDetail() {
  const song = songs.find(s => s.id === selectedId);

  if (!song) {
    dom.songDetail.style.display = 'none';
    dom.noSelection.style.display = 'flex';
    return;
  }

  dom.noSelection.style.display = 'none';
  dom.songDetail.style.display  = 'block';

  dom.detailTitle.textContent  = song.title;
  dom.detailArtist.textContent = song.artist || '';
  dom.detailArtist.style.display = song.artist ? 'block' : 'none';

  // Transpose indicator
  const sign = transposeSteps > 0 ? '+' : '';
  dom.transposeValue.textContent = sign + transposeSteps;
  dom.transposeHint.textContent  =
    transposeSteps !== 0 ? '(viewing in transposed key)' : '';

  // Build display HTML
  const transposed = transposeText(song.chords || '', transposeSteps);
  dom.chordsDisplay.innerHTML = buildChordsHtml(transposed);
}

// ─── Song operations ─────────────────────────────────────────────────────────

function selectSong(id) {
  selectedId     = id;
  transposeSteps = 0;
  renderSongList();
  renderSongDetail();
}

function deleteSelectedSong() {
  if (!confirm('Delete this song? This cannot be undone.')) return;
  songs      = songs.filter(s => s.id !== selectedId);
  selectedId = null;
  persistSongs(songs);
  renderSongList();
  renderSongDetail();
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(songId) {
  editingId = songId || null;

  if (songId) {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    dom.modalTitle.textContent  = 'Edit Song';
    dom.formTitle.value  = song.title;
    dom.formArtist.value = song.artist || '';
    dom.formChords.value = song.chords || '';
  } else {
    dom.modalTitle.textContent = 'Add Song';
    dom.songForm.reset();
  }

  dom.modalOverlay.style.display = 'flex';
  setTimeout(() => dom.formTitle.focus(), 50);
}

function closeModal() {
  dom.modalOverlay.style.display = 'none';
  editingId = null;
}

function saveSong() {
  const title = dom.formTitle.value.trim();
  if (!title) {
    dom.formTitle.focus();
    dom.formTitle.classList.add('input-error');
    return;
  }
  dom.formTitle.classList.remove('input-error');

  const data = {
    title,
    artist: dom.formArtist.value.trim(),
    chords: dom.formChords.value,
  };

  if (editingId) {
    const idx = songs.findIndex(s => s.id === editingId);
    if (idx !== -1) {
      songs[idx] = { ...songs[idx], ...data };
      selectedId = editingId;
    }
  } else {
    const newSong = { id: generateId(), ...data };
    songs.push(newSong);
    selectedId = newSong.id;
  }

  transposeSteps = 0;
  persistSongs(songs);
  closeModal();
  renderSongList();
  renderSongDetail();
}

// ─── Event listeners ─────────────────────────────────────────────────────────

$('btn-add-song').addEventListener('click', () => openModal(null));
$('btn-edit-song').addEventListener('click', () => openModal(selectedId));
$('btn-delete-song').addEventListener('click', deleteSelectedSong);

$('btn-transpose-up').addEventListener('click', () => {
  transposeSteps++;
  renderSongDetail();
});
$('btn-transpose-down').addEventListener('click', () => {
  transposeSteps--;
  renderSongDetail();
});
$('btn-transpose-reset').addEventListener('click', () => {
  transposeSteps = 0;
  renderSongDetail();
});

$('btn-close-modal').addEventListener('click', closeModal);
$('btn-cancel').addEventListener('click', closeModal);

dom.modalOverlay.addEventListener('click', e => {
  if (e.target === dom.modalOverlay) closeModal();
});

dom.searchInput.addEventListener('input', renderSongList);

dom.songForm.addEventListener('submit', e => {
  e.preventDefault();
  saveSong();
});

// Clear error state on title field once user starts typing
dom.formTitle.addEventListener('input', () => {
  dom.formTitle.classList.remove('input-error');
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dom.modalOverlay.style.display === 'flex') {
    closeModal();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

renderSongList();
renderSongDetail();
