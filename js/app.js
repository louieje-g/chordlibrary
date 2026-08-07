/**
 * Chord Library - A mobile-first offline chord library application
 * Features: Song management, Chord transposition, Playlists, Swipe navigation
 */

(function() {
  'use strict';

  // ================================================
  // Constants & Helpers
  // ================================================
  
  const STORAGE_KEYS = {
    SONGS: 'chord-library-songs',
    PLAYLISTS: 'chord-library-playlists',
    FONT_SIZE: 'chord-library-font-size',
    THEME: 'chord-library-theme',
    SIDEBAR_SCROLL: 'chord-library-sidebar-scroll',
    NOTATION: 'chord-library-notation'
  };

  // Musical notes for transposition
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  // Regex for matching chord patterns
  const QUALITY = '(?:m(?:aj)?|M(?:aj)?|min|dim|aug|sus[24]?|add|\\d)[a-z0-9]*';
  const CHORD_RE = () => new RegExp(
    `(?<![A-Za-z])([A-G][#b]?)(${QUALITY})?(\\/[A-G][#b]?(?:${QUALITY})?)?(?![a-zA-Z0-9#b])`,
    'g'
  );
  const SONG_QR_TYPE = 'cl-song';
  const SONG_QR_VERSION = 1;

  /**
   * Generate a unique ID
   */
  function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : 
      'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Shorthand for document.getElementById
   */
  function $(id) {
    return document.getElementById(id);
  }

  /**
   * Shorthand for querySelectorAll
   */
  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  // ================================================
  // State Management
  // ================================================
  
  let songs = [];
  let playlists = [];
  let selectedSongId = null;
  let selectedPlaylistId = null;
  let viewingPlaylistSongIndex = -1;
  let transposeSteps = 0;
  let editingSongId = null;
  let editingPlaylistId = null;
  let confirmCallback = null;
  let currentFontSize = 14; // Default font size for chord content
  let viewingFromPlaylistId = null; // Track which playlist we're viewing from (for auto-add)
  let undoTimer = null;
  let undoData = null; // { type, item, playlists?, songs? }
  let qrScannerStream = null;
  let qrScannerActive = false;
  let qrScannerRafId = null;
  let qrDetector = null;
  let qrCodeLoadPromise = null;
  let notationPref = 'original'; // 'original', 'sharp', or 'flat'

  // ================================================
  // DOM Elements
  // ================================================
  
  const dom = {
    // Sidebar
    sidebar: $('sidebar'),
    menuToggle: $('menu-toggle'),
    searchInput: $('search-input'),
    songList: $('song-list'),
    playlistList: $('playlist-list'),
    songsSort: $('songs-sort'),
    playlistsSort: $('playlists-sort'),
    
    // Content
    content: $('content'),
    emptyState: $('empty-state'),
    songDetail: $('song-detail'),
    playlistDetail: $('playlist-detail'),
    
    // Song Navigation Hint
    songNavHint: $('song-nav-hint'),
    navHintInfo: $('nav-hint-info'),
    
    // Song Toolbar
    fontSizeSelect: $('font-size-select'),
    transposeUp: $('btn-transpose-up'),
    transposeDown: $('btn-transpose-down'),
    transposeReset: $('btn-transpose-reset'),
    transposeValue: $('transpose-value'),
    
    // Header
    appTitle: $('app-title'),
    
    // Song Detail
    songContent: $('song-content'),
    
    // Playlist Detail
    playlistTitle: $('playlist-title'),
    playlistDescription: $('playlist-description'),
    playlistSongs: $('playlist-songs'),
    
    // Modals
    songModal: $('song-modal'),
    songForm: $('song-form'),
    songModalTitle: $('song-modal-title'),
    songTitleInput: $('song-title-input'),
    songArtistInput: $('song-artist-input'),
    songContentInput: $('song-content-input'),
    shareQrModal: $('share-qr-modal'),
    shareQrCanvas: $('share-qr-canvas'),
    shareQrHelp: $('share-qr-help'),
    scanQrOverlay: $('qr-scanner-overlay'),
    scanQrVideo: $('scan-qr-video'),
    
    playlistModal: $('playlist-modal'),
    playlistForm: $('playlist-form'),
    playlistModalTitle: $('playlist-modal-title'),
    playlistNameInput: $('playlist-name-input'),
    playlistDescriptionInput: $('playlist-description-input'),
    
    addSongsModal: $('add-songs-modal'),
    songSelector: $('song-selector'),
    
    confirmModal: $('confirm-modal'),
    confirmMessage: $('confirm-message')
  };

  // ================================================
  // Storage Functions
  // ================================================
  
  function loadData() {
    try {
      const songsData = localStorage.getItem(STORAGE_KEYS.SONGS);
      const playlistsData = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      songs = songsData ? JSON.parse(songsData) : [];
      playlists = playlistsData ? JSON.parse(playlistsData) : [];
    } catch (e) {
      console.error('Error loading data:', e);
      songs = [];
      playlists = [];
    }
  }

  function saveSongs() {
    try {
      localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(songs));
      if (typeof SyncService !== 'undefined') {
        SyncService.onDataChanged('songs', songs);
      }
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        showToast('Storage full — unable to save. Delete some songs to free space.', 'error');
      } else {
        console.error('Error saving songs:', e);
      }
    }
  }

  function savePlaylists() {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
      if (typeof SyncService !== 'undefined') {
        SyncService.onDataChanged('playlists', playlists);
      }
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        showToast('Storage full — unable to save. Delete some items to free space.', 'error');
      } else {
        console.error('Error saving playlists:', e);
      }
    }
  }

  // ================================================
  // Transposition Functions
  // ================================================
  
  /**
   * Transpose a single note by the given number of steps
   */
  function transposeNote(note, steps) {
    let index = NOTES.indexOf(note);
    const useFlat = index === -1;
    if (useFlat) index = NOTES_FLAT.indexOf(note);
    if (index === -1) return note;
    const newIndex = ((index + steps) % 12 + 12) % 12;
    return useFlat ? NOTES_FLAT[newIndex] : NOTES[newIndex];
  }

  /**
   * Transpose all chords in a text string
   */
  function transposeText(text, steps) {
    if (!text || steps === 0) return text || '';
    return text.replace(CHORD_RE(), (_, root, quality, slash) => {
      const newRoot = transposeNote(root, steps);
      let result = newRoot + (quality || '');
      if (slash) {
        const match = slash.match(/^\/([A-G][#b]?)(.*)/);
        if (match) {
          result += '/' + transposeNote(match[1], steps) + (match[2] || '');
        } else {
          result += slash;
        }
      }
      return result;
    });
  }

  /**
   * Convert a note to the preferred notation (sharp/flat/original)
   */
  function convertNoteNotation(note) {
    if (notationPref === 'original') return note;
    let index = NOTES.indexOf(note);
    if (index === -1) index = NOTES_FLAT.indexOf(note);
    if (index === -1) return note;
    return notationPref === 'sharp' ? NOTES[index] : NOTES_FLAT[index];
  }

  /**
   * Apply notation preference to all chords in text
   */
  function applyNotationPreference(text) {
    if (!text || notationPref === 'original') return text || '';
    return text.replace(CHORD_RE(), (match, root, quality, slash) => {
      let result = convertNoteNotation(root) + (quality || '');
      if (slash) {
        const m = slash.match(/^\/([A-G][#b]?)(.*)/);
        if (m) {
          result += '/' + convertNoteNotation(m[1]) + (m[2] || '');
        } else {
          result += slash;
        }
      }
      return result;
    });
  }

  /**
   * Highlight chords in text with HTML spans
   */
  function highlightChords(text) {
    if (!text) return '';
    const converted = applyNotationPreference(text);
    const escaped = converted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Highlight chords
    let result = escaped.replace(CHORD_RE(), (match) => {
      const display = match.replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭');
      return '<span class="chord">' + display + '</span>';
    });
    // Highlight bracketed commands like [to chorus], [intro], etc.
    result = result.replace(/\[([^\]]+)\]/g, (match, inner) => {
      // If the bracket content is just a chord (A-G with optional #/b and quality), don't re-highlight
      if (/^[A-G][#b]?/.test(inner) && inner.length <= 6) return match;
      return '<span class="bracket-command">' + match + '</span>';
    });
    return result;
  }

  // ================================================
  // Sidebar Functions
  // ================================================
  
  let sidebarOverlay = null;

  function createSidebarOverlay() {
    if (!sidebarOverlay) {
      sidebarOverlay = document.createElement('div');
      sidebarOverlay.className = 'sidebar-overlay';
      document.body.appendChild(sidebarOverlay);
      sidebarOverlay.addEventListener('click', closeSidebar);
    }
  }

  function openSidebar() {
    createSidebarOverlay();
    dom.sidebar.classList.add('open');
    dom.menuToggle.classList.add('active');
    sidebarOverlay.classList.add('visible');
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.menuToggle.classList.remove('active');
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove('visible');
    }
  }

  function toggleSidebar() {
    if (dom.sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // ================================================
  // Render Functions
  // ================================================
  
  /**
   * Sort items by the given sort option
   */
  function sortItems(items, sortOption, nameKey = 'title') {
    const sorted = [...items];
    switch (sortOption) {
      case 'name-asc':
        sorted.sort((a, b) => (a[nameKey] || '').localeCompare(b[nameKey] || ''));
        break;
      case 'name-desc':
        sorted.sort((a, b) => (b[nameKey] || '').localeCompare(a[nameKey] || ''));
        break;
      case 'updated-asc':
        sorted.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        break;
      case 'updated-desc':
      default:
        sorted.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
    }
    return sorted;
  }

  function renderSongList() {
    const query = dom.searchInput.value.trim().toLowerCase();
    const sortOption = dom.songsSort ? dom.songsSort.value : 'updated-desc';
    
    let filtered = query
      ? songs.filter(s => 
          s.title.toLowerCase().includes(query) ||
          (s.artist && s.artist.toLowerCase().includes(query)) ||
          (s.content && s.content.toLowerCase().includes(query)))
      : songs;
    
    // Apply sorting
    filtered = sortItems(filtered, sortOption, 'title');

    if (filtered.length === 0) {
      dom.songList.innerHTML = `
        <li class="empty-list-message" style="padding: 16px; color: var(--text-muted); text-align: center;">
          ${query ? 'No songs found' : 'No songs yet. Add one!'}
        </li>
      `;
      return;
    }

    dom.songList.innerHTML = filtered.map(song => `
      <li class="song-item ${song.id === selectedSongId ? 'active' : ''}" data-id="${song.id}">
        <div class="song-item-title">${escapeHtml(song.title)}</div>
        ${song.artist ? `<div class="song-item-artist">${escapeHtml(song.artist)}</div>` : ''}
      </li>
    `).join('');
  }

  function renderPlaylistList() {
    const sortOption = dom.playlistsSort ? dom.playlistsSort.value : 'updated-desc';
    
    if (playlists.length === 0) {
      dom.playlistList.innerHTML = `
        <li class="empty-list-message" style="padding: 16px; color: var(--text-muted); text-align: center;">
          No playlists yet. Create one!
        </li>
      `;
      return;
    }
    
    // Apply sorting
    const sortedPlaylists = sortItems(playlists, sortOption, 'name');

    dom.playlistList.innerHTML = sortedPlaylists.map(playlist => `
      <li class="playlist-item ${playlist.id === selectedPlaylistId && viewingPlaylistSongIndex === -1 ? 'active' : ''}" data-id="${playlist.id}">
        <div class="playlist-item-name">${escapeHtml(playlist.name)}</div>
        <div class="playlist-item-count">${playlist.songIds.length} songs</div>
      </li>
    `).join('');
  }

  function renderHomeDashboard() {
    const dashboard = $('home-dashboard');
    const fallback = $('empty-state-fallback');
    const homeSongsList = $('home-songs-list');
    const homePlaylistsList = $('home-playlists-list');

    if (songs.length === 0 && playlists.length === 0) {
      dashboard.classList.add('hidden');
      fallback.style.display = '';
      return;
    }

    dashboard.classList.remove('hidden');
    fallback.style.display = 'none';

    const recentSongs = [...songs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);
    const recentPlaylists = [...playlists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);

    $('home-recent-songs').style.display = recentSongs.length ? '' : 'none';
    $('home-recent-playlists').style.display = recentPlaylists.length ? '' : 'none';

    homeSongsList.innerHTML = recentSongs.map(song => `
      <li class="song-item" data-id="${song.id}">
        <div class="song-item-title">${escapeHtml(song.title)}</div>
        ${song.artist ? `<div class="song-item-artist">${escapeHtml(song.artist)}</div>` : ''}
      </li>
    `).join('');

    homePlaylistsList.innerHTML = recentPlaylists.map(playlist => `
      <li class="playlist-item" data-id="${playlist.id}">
        <div class="playlist-item-name">${escapeHtml(playlist.name)}</div>
        <div class="playlist-item-count">${playlist.songIds.length} songs</div>
      </li>
    `).join('');

    homeSongsList.onclick = (e) => {
      const item = e.target.closest('.song-item');
      if (item) selectSong(item.dataset.id);
    };
    homePlaylistsList.onclick = (e) => {
      const item = e.target.closest('.playlist-item');
      if (item) selectPlaylist(item.dataset.id);
    };
  }

  function renderSongDetail() {
    const song = songs.find(s => s.id === selectedSongId);
    if (!song) {
      dom.emptyState.classList.remove('hidden');
      dom.songDetail.classList.add('hidden');
      dom.playlistDetail.classList.add('hidden');
      // Reset header title
      dom.appTitle.textContent = 'Chord Library';
      renderHomeDashboard();
      return;
    }

    dom.emptyState.classList.add('hidden');
    dom.songDetail.classList.remove('hidden');
    dom.playlistDetail.classList.add('hidden');

    // Move song title into header bar for compact view
    const transposedTitle = transposeSteps !== 0 
      ? `${song.title} (${transposeSteps > 0 ? '+' : ''}${transposeSteps})`
      : song.title;
    const artistSuffix = song.artist ? ` — ${song.artist}` : '';
    dom.appTitle.textContent = transposedTitle + artistSuffix;
    dom.appTitle.title = transposedTitle + artistSuffix;

    // Show/hide back-to-playlist button
    const backBtn = document.getElementById('btn-back-playlist');
    const backLabel = document.getElementById('btn-back-playlist-label');
    if (selectedPlaylistId && viewingPlaylistSongIndex >= 0) {
      const playlist = playlists.find(p => p.id === selectedPlaylistId);
      if (backBtn) {
        backBtn.classList.remove('hidden');
        if (backLabel) backLabel.textContent = playlist ? playlist.name : 'Playlist';
      }
    } else {
      if (backBtn) backBtn.classList.add('hidden');
    }

    // Update transpose display
    dom.transposeValue.textContent = transposeSteps;
    dom.transposeValue.className = 'transpose-value';
    if (transposeSteps > 0) dom.transposeValue.classList.add('positive');
    else if (transposeSteps < 0) dom.transposeValue.classList.add('negative');

    // Apply font size to song content
    const lineHeight = Math.round(currentFontSize * 1.6);
    dom.songContent.style.fontSize = currentFontSize + 'px';
    dom.songContent.style.lineHeight = lineHeight + 'px';

    // Transpose and highlight chords
    const transposedContent = transposeText(song.content, transposeSteps);
    dom.songContent.innerHTML = highlightChords(transposedContent);

    // Update navigation hint if viewing from playlist
    updateSongNavigation();
  }

  function renderPlaylistDetail() {
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) {
      dom.emptyState.classList.remove('hidden');
      dom.songDetail.classList.add('hidden');
      dom.playlistDetail.classList.add('hidden');
      // Reset header title
      dom.appTitle.textContent = 'Chord Library';
      renderHomeDashboard();
      return;
    }

    dom.emptyState.classList.add('hidden');
    dom.songDetail.classList.add('hidden');
    dom.playlistDetail.classList.remove('hidden');

    // Reset header title when viewing playlist (not a song)
    dom.appTitle.textContent = 'Chord Library';

    dom.playlistTitle.textContent = playlist.name;
    dom.playlistDescription.textContent = playlist.description || '';

    const playlistSongs = playlist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean);

    if (playlistSongs.length === 0) {
      dom.playlistSongs.innerHTML = `
        <li style="padding: 16px; color: var(--text-muted); text-align: center;">
          No songs in this playlist
        </li>
      `;
      return;
    }

    dom.playlistSongs.innerHTML = playlistSongs.map((song, index) => `
      <li class="playlist-song-item" data-id="${song.id}" data-index="${index}" draggable="true">
        <span class="drag-handle" aria-label="Drag to reorder">⋮⋮</span>
        <div class="playlist-song-info">
          <div class="playlist-song-title">${escapeHtml(song.title)}</div>
          ${song.artist ? `<div class="playlist-song-artist">${escapeHtml(song.artist)}</div>` : ''}
        </div>
        <button class="btn-remove-song" data-id="${song.id}" title="Remove from playlist">✕</button>
      </li>
    `).join('');

    setupPlaylistDragDrop();
  }

  function setupPlaylistDragDrop() {
    const list = dom.playlistSongs;
    
    // Prevent duplicate listeners — use a flag on the element
    if (list._dragDropInitialized) return;
    list._dragDropInitialized = true;

    let draggedItem = null;
    let draggedIndex = -1;

    // Desktop drag-and-drop
    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.playlist-song-item');
      if (!item) return;
      draggedItem = item;
      draggedIndex = parseInt(item.dataset.index, 10);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedIndex.toString());
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.playlist-song-item');
      if (!target || target === draggedItem) return;

      clearDragIndicators();
      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        target.classList.add('drag-over-top');
      } else {
        target.classList.add('drag-over-bottom');
      }
    });

    list.addEventListener('dragleave', (e) => {
      const target = e.target.closest('.playlist-song-item');
      if (target) {
        target.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('.playlist-song-item');
      if (!target || target === draggedItem) {
        clearDragIndicators();
        return;
      }

      let targetIndex = parseInt(target.dataset.index, 10);
      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY >= midY) targetIndex++;

      reorderPlaylistSong(draggedIndex, targetIndex);
      clearDragIndicators();
    });

    list.addEventListener('dragend', () => {
      if (draggedItem) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
      }
      clearDragIndicators();
    });

    // Touch drag-and-drop (long-press to initiate)
    let touchTimer = null;
    let touchDragging = false;
    let touchItem = null;
    let touchIndex = -1;
    let ghost = null;
    let touchStartY = 0;

    list.addEventListener('touchstart', (e) => {
      const handle = e.target.closest('.drag-handle');
      if (!handle) return;
      const item = handle.closest('.playlist-song-item');
      if (!item) return;

      touchStartY = e.touches[0].clientY;
      touchTimer = setTimeout(() => {
        touchDragging = true;
        touchItem = item;
        touchIndex = parseInt(item.dataset.index, 10);
        item.classList.add('touch-dragging');

        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = item.querySelector('.playlist-song-title').textContent;
        document.body.appendChild(ghost);
        positionGhost(e.touches[0]);

        if (navigator.vibrate) navigator.vibrate(30);
      }, 300);
    }, { passive: true });

    list.addEventListener('touchmove', (e) => {
      if (!touchDragging) {
        if (touchTimer && Math.abs(e.touches[0].clientY - touchStartY) > 10) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
        return;
      }
      e.preventDefault();
      positionGhost(e.touches[0]);

      clearDragIndicators();
      const touch = e.touches[0];
      const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = elemBelow ? elemBelow.closest('.playlist-song-item') : null;
      if (target && target !== touchItem) {
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (touch.clientY < midY) {
          target.classList.add('drag-over-top');
        } else {
          target.classList.add('drag-over-bottom');
        }
      }
    }, { passive: false });

    list.addEventListener('touchend', (e) => {
      clearTimeout(touchTimer);
      touchTimer = null;

      if (!touchDragging) return;
      touchDragging = false;

      if (ghost) {
        ghost.remove();
        ghost = null;
      }

      if (touchItem) {
        touchItem.classList.remove('touch-dragging');
      }

      const touch = e.changedTouches[0];
      const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = elemBelow ? elemBelow.closest('.playlist-song-item') : null;

      if (target && target !== touchItem) {
        let targetIdx = parseInt(target.dataset.index, 10);
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (touch.clientY >= midY) targetIdx++;
        reorderPlaylistSong(touchIndex, targetIdx);
      }

      clearDragIndicators();
      touchItem = null;
    });

    function positionGhost(touch) {
      if (ghost) {
        ghost.style.left = (touch.clientX + 12) + 'px';
        ghost.style.top = (touch.clientY - 20) + 'px';
      }
    }

    function clearDragIndicators() {
      list.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    }
  }

  function goHome() {
    selectedSongId = null;
    selectedPlaylistId = null;
    viewingPlaylistSongIndex = -1;
    viewingFromPlaylistId = null;
    transposeSteps = 0;

    dom.emptyState.classList.remove('hidden');
    dom.songDetail.classList.add('hidden');
    dom.playlistDetail.classList.add('hidden');
    dom.appTitle.textContent = 'Chord Library';
    $('btn-home').classList.add('hidden');

    renderSongList();
    renderPlaylistList();
    renderHomeDashboard();
  }

  function reorderPlaylistSong(fromIndex, toIndex) {
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;

    if (toIndex > fromIndex) toIndex--;
    if (fromIndex === toIndex) return;

    const [moved] = playlist.songIds.splice(fromIndex, 1);
    playlist.songIds.splice(toIndex, 0, moved);
    playlist.updatedAt = Date.now();

    savePlaylists();
    renderPlaylistDetail();
    renderPlaylistList();
  }

  function updateSongNavigation() {
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    
    if (!playlist || viewingPlaylistSongIndex < 0) {
      dom.songNavHint.classList.add('hidden');
      return;
    }

    const playlistSongs = playlist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean);

    if (playlistSongs.length <= 1) {
      dom.songNavHint.classList.add('hidden');
      return;
    }

    dom.songNavHint.classList.remove('hidden');
    dom.navHintInfo.textContent = `${viewingPlaylistSongIndex + 1} / ${playlistSongs.length}`;
  }

  // ================================================
  // Song Actions
  // ================================================
  
  function selectSong(id, fromPlaylist = false, index = -1) {
    selectedSongId = id;
    
    // Load persistent transpose value for this song
    const song = songs.find(s => s.id === id);
    transposeSteps = song && typeof song.transposeSteps === 'number' ? song.transposeSteps : 0;
    
    if (fromPlaylist) {
      viewingPlaylistSongIndex = index;
      viewingFromPlaylistId = selectedPlaylistId;
    } else {
      selectedPlaylistId = null;
      viewingPlaylistSongIndex = -1;
      viewingFromPlaylistId = null;
    }
    
    saveSidebarScroll();
    renderSongList();
    renderSongDetail();
    closeSidebar();
    $('btn-home').classList.remove('hidden');
    
    // Announce to screen readers
    if (song) announce(`Viewing ${song.title}`);
  }

  function openSongModal(songId = null) {
    editingSongId = songId;
    stopQrScan();
    closeScannerOverlay();
    
    if (songId) {
      const song = songs.find(s => s.id === songId);
      if (song) {
        dom.songModalTitle.textContent = 'Edit Song';
        dom.songTitleInput.value = song.title;
        dom.songArtistInput.value = song.artist || '';
        dom.songContentInput.value = song.content;
      }
    } else {
      dom.songModalTitle.textContent = 'Add Song';
      dom.songForm.reset();
    }
    
    openModalWithFocusTrap(dom.songModal);
    setTimeout(() => dom.songTitleInput.focus(), 100);
  }

  function closeSongModal() {
    stopQrScan();
    closeScannerOverlay();
    closeModalWithFocusTrap(dom.songModal);
    editingSongId = null;
    dom.songForm.reset();
  }

  function saveSong(e) {
    e.preventDefault();
    
    const title = dom.songTitleInput.value.trim();
    const artist = dom.songArtistInput.value.trim();
    const content = dom.songContentInput.value;
    
    if (!title || !content) return;
    
    if (editingSongId) {
      const song = songs.find(s => s.id === editingSongId);
      if (song) {
        song.title = title;
        song.artist = artist;
        song.content = content;
        song.updatedAt = Date.now();
      }
    } else {
      const newSong = {
        id: generateId(),
        title,
        artist,
        content,
        transposeSteps: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      songs.push(newSong);
      selectedSongId = newSong.id;
      transposeSteps = 0; // Reset transpose for new song
      
      // Auto-add new song to current playlist if viewing from playlist
      if (viewingFromPlaylistId) {
        const playlist = playlists.find(p => p.id === viewingFromPlaylistId);
        if (playlist) {
          playlist.songIds.push(newSong.id);
          playlist.updatedAt = Date.now();
          // Update the index to point to the new song (last in playlist)
          viewingPlaylistSongIndex = playlist.songIds.length - 1;
          savePlaylists();
          renderPlaylistList();
        }
      } else {
        // Not from playlist, reset the index
        viewingPlaylistSongIndex = -1;
      }
    }
    
    saveSongs();
    closeSongModal();
    renderSongList();
    renderSongDetail();
  }

  function deleteSong(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    openConfirmModal(
      `Are you sure you want to delete "${song.title}"?`,
      () => {
        // Store undo data before deleting
        const removedSong = { ...song };
        const playlistBackups = playlists.map(p => ({ id: p.id, songIds: [...p.songIds] }));
        
        songs = songs.filter(s => s.id !== id);
        
        // Remove from all playlists
        playlists.forEach(playlist => {
          playlist.songIds = playlist.songIds.filter(songId => songId !== id);
        });
        
        saveSongs();
        savePlaylists();
        
        if (selectedSongId === id) {
          selectedSongId = null;
          viewingPlaylistSongIndex = -1;
        }
        
        renderSongList();
        renderSongDetail();
        renderPlaylistList();
        
        // Show undo toast
        showUndoToast(`"${removedSong.title}" deleted`, () => {
          // Undo: restore song and playlist references
          songs.push(removedSong);
          playlistBackups.forEach(backup => {
            const playlist = playlists.find(p => p.id === backup.id);
            if (playlist) playlist.songIds = backup.songIds;
          });
          saveSongs();
          savePlaylists();
          selectedSongId = removedSong.id;
          transposeSteps = removedSong.transposeSteps || 0;
          renderSongList();
          renderSongDetail();
          renderPlaylistList();
        });

        // Sync tombstone after undo window expires
        setTimeout(() => {
          if (!songs.find(s => s.id === id)) {
            if (typeof SyncService !== 'undefined') {
              SyncService.onItemDeleted('songs', removedSong);
            }
          }
        }, 6000);
      }
    );
  }

  // ================================================
  // Playlist Actions
  // ================================================
  
  function selectPlaylist(id) {
    selectedPlaylistId = id;
    selectedSongId = null;
    viewingPlaylistSongIndex = -1;
    viewingFromPlaylistId = id; // Track for auto-add feature
    transposeSteps = 0;
    
    renderPlaylistList();
    renderPlaylistDetail();
    closeSidebar();
    $('btn-home').classList.remove('hidden');
  }

  function openPlaylistModal(playlistId = null) {
    editingPlaylistId = playlistId;
    
    if (playlistId) {
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        dom.playlistModalTitle.textContent = 'Edit Playlist';
        dom.playlistNameInput.value = playlist.name;
        dom.playlistDescriptionInput.value = playlist.description || '';
      }
    } else {
      dom.playlistModalTitle.textContent = 'Create Playlist';
      dom.playlistForm.reset();
    }
    
    openModalWithFocusTrap(dom.playlistModal);
    setTimeout(() => dom.playlistNameInput.focus(), 100);
  }

  function closePlaylistModal() {
    closeModalWithFocusTrap(dom.playlistModal);
    editingPlaylistId = null;
    dom.playlistForm.reset();
  }

  function savePlaylist(e) {
    e.preventDefault();
    
    const name = dom.playlistNameInput.value.trim();
    const description = dom.playlistDescriptionInput.value.trim();
    
    if (!name) return;
    
    if (editingPlaylistId) {
      const playlist = playlists.find(p => p.id === editingPlaylistId);
      if (playlist) {
        playlist.name = name;
        playlist.description = description;
        playlist.updatedAt = Date.now();
      }
    } else {
      const newPlaylist = {
        id: generateId(),
        name,
        description,
        songIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      playlists.push(newPlaylist);
      selectedPlaylistId = newPlaylist.id;
    }
    
    savePlaylists();
    closePlaylistModal();
    renderPlaylistList();
    renderPlaylistDetail();
  }

  function deletePlaylist(id) {
    const playlist = playlists.find(p => p.id === id);
    if (!playlist) return;
    
    openConfirmModal(
      `Are you sure you want to delete playlist "${playlist.name}"?`,
      () => {
        const removedPlaylist = { ...playlist, songIds: [...playlist.songIds] };
        
        playlists = playlists.filter(p => p.id !== id);
        savePlaylists();
        
        if (selectedPlaylistId === id) {
          selectedPlaylistId = null;
        }
        
        renderPlaylistList();
        dom.emptyState.classList.remove('hidden');
        dom.playlistDetail.classList.add('hidden');
        
        // Show undo toast
        showUndoToast(`"${removedPlaylist.name}" deleted`, () => {
          playlists.push(removedPlaylist);
          savePlaylists();
          selectedPlaylistId = removedPlaylist.id;
          renderPlaylistList();
          renderPlaylistDetail();
        });

        // Sync tombstone after undo window expires
        setTimeout(() => {
          if (!playlists.find(p => p.id === id)) {
            if (typeof SyncService !== 'undefined') {
              SyncService.onItemDeleted('playlists', removedPlaylist);
            }
          }
        }, 6000);
      }
    );
  }

  function openAddSongsModal() {
    if (!selectedPlaylistId) return;
    
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    const sortedSongs = [...songs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    dom.songSelector.innerHTML = sortedSongs.map(song => `
      <label class="song-selector-item">
        <input type="checkbox" value="${song.id}" ${playlist.songIds.includes(song.id) ? 'checked' : ''}>
        <div class="song-selector-info">
          <div class="song-selector-title">${escapeHtml(song.title)}</div>
          ${song.artist ? `<div class="song-selector-artist">${escapeHtml(song.artist)}</div>` : ''}
        </div>
      </label>
    `).join('');
    
    openModalWithFocusTrap(dom.addSongsModal);
  }

  function closeAddSongsModal() {
    closeModalWithFocusTrap(dom.addSongsModal);
  }

  function confirmAddSongs() {
    if (!selectedPlaylistId) return;
    
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    const checkboxes = dom.songSelector.querySelectorAll('input[type="checkbox"]');
    const selectedIds = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    
    // Preserve existing order (oldest first), append newly added at the end
    const existing = playlist.songIds.filter(id => selectedIds.includes(id));
    const added = selectedIds.filter(id => !playlist.songIds.includes(id));
    playlist.songIds = [...existing, ...added];
    playlist.updatedAt = Date.now();
    
    savePlaylists();
    closeAddSongsModal();
    renderPlaylistDetail();
    renderPlaylistList();
  }

  function removeSongFromPlaylist(songId) {
    if (!selectedPlaylistId) return;
    
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    playlist.songIds = playlist.songIds.filter(id => id !== songId);
    playlist.updatedAt = Date.now();
    
    savePlaylists();
    renderPlaylistDetail();
    renderPlaylistList();
  }

  // ================================================
  // Playlist Navigation
  // ================================================
  
  function navigateToPreviousSong() {
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist || viewingPlaylistSongIndex <= 0) return;
    
    const playlistSongs = playlist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean);
    
    viewingPlaylistSongIndex--;
    const song = playlistSongs[viewingPlaylistSongIndex];
    if (song) {
      selectedSongId = song.id;
      // Load persistent transpose value for this song
      transposeSteps = typeof song.transposeSteps === 'number' ? song.transposeSteps : 0;
      renderSongDetail();
    }
  }

  function navigateToNextSong() {
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    const playlistSongs = playlist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean);
    
    if (viewingPlaylistSongIndex >= playlistSongs.length - 1) return;
    
    viewingPlaylistSongIndex++;
    const song = playlistSongs[viewingPlaylistSongIndex];
    if (song) {
      selectedSongId = song.id;
      // Load persistent transpose value for this song
      transposeSteps = typeof song.transposeSteps === 'number' ? song.transposeSteps : 0;
      renderSongDetail();
    }
  }

  // ================================================
  // Swipe Navigation (Mobile)
  // ================================================
  
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;
  let swipeIndicatorLeft = null;
  let swipeIndicatorRight = null;

  function createSwipeIndicators() {
    swipeIndicatorLeft = document.createElement('div');
    swipeIndicatorLeft.className = 'swipe-indicator left';
    swipeIndicatorLeft.innerHTML = '‹';
    document.body.appendChild(swipeIndicatorLeft);

    swipeIndicatorRight = document.createElement('div');
    swipeIndicatorRight.className = 'swipe-indicator right';
    swipeIndicatorRight.innerHTML = '›';
    document.body.appendChild(swipeIndicatorRight);
  }

  function handleTouchStart(e) {
    // Only enable swipe when viewing a song from a playlist
    if (viewingPlaylistSongIndex < 0) return;
    
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    isSwiping = true;
  }

  function handleTouchMove(e) {
    if (!isSwiping || viewingPlaylistSongIndex < 0) return;
    
    const currentX = e.changedTouches[0].screenX;
    const currentY = e.changedTouches[0].screenY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;
    
    // Only show indicators if horizontal swipe is significant
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      const playlist = playlists.find(p => p.id === selectedPlaylistId);
      if (!playlist) return;
      
      const playlistSongs = playlist.songIds.filter(id => songs.find(s => s.id === id));
      
      if (diffX > 0 && viewingPlaylistSongIndex > 0) {
        swipeIndicatorLeft.classList.add('visible');
        swipeIndicatorRight.classList.remove('visible');
      } else if (diffX < 0 && viewingPlaylistSongIndex < playlistSongs.length - 1) {
        swipeIndicatorRight.classList.add('visible');
        swipeIndicatorLeft.classList.remove('visible');
      }
    }
  }

  function handleTouchEnd(e) {
    if (!isSwiping || viewingPlaylistSongIndex < 0) {
      isSwiping = false;
      return;
    }
    
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // Hide indicators
    swipeIndicatorLeft.classList.remove('visible');
    swipeIndicatorRight.classList.remove('visible');
    
    // Minimum swipe distance: 80px, and more horizontal than vertical
    if (Math.abs(diffX) > 80 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0) {
        navigateToPreviousSong();
      } else {
        navigateToNextSong();
      }
    }
    
    isSwiping = false;
  }

  // ================================================
  // Confirm Modal
  // ================================================
  
  function openConfirmModal(message, callback) {
    dom.confirmMessage.textContent = message;
    confirmCallback = callback;
    openModalWithFocusTrap(dom.confirmModal);
  }

  function closeConfirmModal() {
    closeModalWithFocusTrap(dom.confirmModal);
    confirmCallback = null;
  }

  function executeConfirm() {
    if (confirmCallback) {
      confirmCallback();
    }
    closeConfirmModal();
  }

  // ================================================
  // Utility Functions
  // ================================================
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show a toast notification (used when SyncService is not available)
   */
  function showToast(message, type) {
    if (typeof SyncService !== 'undefined' && SyncService.showToast) {
      SyncService.showToast(message, type);
      return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
  }

  /**
   * Show undo toast with a callback
   */
  function showUndoToast(message, undoCallback) {
    const toast = document.getElementById('undo-toast');
    const msgEl = document.getElementById('undo-toast-message');
    const undoBtn = document.getElementById('btn-undo');
    if (!toast) return;

    // Clear previous timer
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }

    msgEl.textContent = message;
    toast.classList.remove('hidden');

    const cleanup = () => {
      toast.classList.add('hidden');
      undoBtn.removeEventListener('click', handleUndo);
      undoTimer = null;
    };

    const handleUndo = () => {
      if (undoTimer) clearTimeout(undoTimer);
      undoCallback();
      cleanup();
      showToast('Restored', 'success');
    };

    undoBtn.addEventListener('click', handleUndo, { once: true });
    undoTimer = setTimeout(cleanup, 5000);
  }

  /**
   * Export all data as JSON download
   */
  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: songs,
      playlists: playlists
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chord-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported', 'success');
  }

  /**
   * Export a single song as JSON download
   */
  function exportSingleSong(songId) {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    const data = {
      version: 1,
      type: 'single-song',
      exportedAt: new Date().toISOString(),
      song: song
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = song.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    a.download = `${safeName}.chord.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`"${song.title}" exported`, 'success');
  }

  function normalizeSongPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || raw.n || '').trim();
    const artist = String(raw.artist || raw.a || '').trim();
    const content = String(raw.content || raw.c || '');
    if (!title || !content) return null;
    return { title, artist, content };
  }

  function extractSongFromParsedData(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'single-song' && data.song) {
      return normalizeSongPayload(data.song);
    }
    if (data.t === SONG_QR_TYPE && Number(data.v) === SONG_QR_VERSION) {
      return normalizeSongPayload(data);
    }
    if (Array.isArray(data.songs) && data.songs.length > 0) {
      return normalizeSongPayload(data.songs[0]);
    }
    return normalizeSongPayload(data);
  }

  function populateSongForm(song) {
    dom.songTitleInput.value = song.title || '';
    dom.songArtistInput.value = song.artist || '';
    dom.songContentInput.value = song.content || '';
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-qr-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.qrSrc = src;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  async function ensureQrGeneratorLoaded() {
    if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
      return true;
    }

    if (qrCodeLoadPromise) {
      return qrCodeLoadPromise;
    }

    qrCodeLoadPromise = (async () => {
      const candidates = [
        './js/qrcode.js?v=1.0.3',
        'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.js',
        'https://unpkg.com/qrcode/lib/browser.js'
      ];

      for (const src of candidates) {
        try {
          await loadScriptOnce(src);
          if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
            return true;
          }
        } catch (err) {
          // Try next source.
        }
      }

      return false;
    })();

    const loaded = await qrCodeLoadPromise;
    if (!loaded) {
      qrCodeLoadPromise = null;
    }
    return loaded;
  }

  async function shareSongViaQr(songId) {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    const loaded = await ensureQrGeneratorLoaded();
    if (!loaded || !window.QRCode || typeof window.QRCode.toCanvas !== 'function') {
      showToast('QR generator unavailable. Check connection and try again.', 'error');
      return;
    }

    const payload = JSON.stringify({
      t: SONG_QR_TYPE,
      v: SONG_QR_VERSION,
      n: song.title,
      a: song.artist || '',
      c: song.content || ''
    });

    try {
      await window.QRCode.toCanvas(dom.shareQrCanvas, payload, {
        width: 260,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      if (dom.shareQrHelp) {
        dom.shareQrHelp.textContent = 'Open Add Song and tap Scan QR on another device.';
      }
      openModalWithFocusTrap(dom.shareQrModal);
    } catch (err) {
      const message = String((err && err.message) || err || 'QR generation failed');
      if (message.toLowerCase().includes('code length overflow')) {
        showToast('Song is too large for a single QR. Use Export Song file instead.', 'error');
      } else {
        showToast('Failed to generate QR: ' + message, 'error');
      }
    }
  }

  function closeShareQrModal() {
    if (!dom.shareQrModal || dom.shareQrModal.classList.contains('hidden')) return;
    closeModalWithFocusTrap(dom.shareQrModal);
  }

  function getQrDetector() {
    if (!('BarcodeDetector' in window)) return null;
    if (qrDetector) return qrDetector;
    try {
      qrDetector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) {
      qrDetector = new BarcodeDetector();
    }
    return qrDetector;
  }

  function handleScannedSongQr(rawValue) {
    if (!rawValue) return false;
    let parsed;
    try {
      parsed = JSON.parse(rawValue);
    } catch (err) {
      showToast('QR does not contain valid song data.', 'error');
      return false;
    }

    const song = extractSongFromParsedData(parsed);
    if (!song) {
      showToast('QR does not contain a compatible song.', 'error');
      return false;
    }

    populateSongForm(song);
    showToast('Song loaded from QR. Review and save.', 'success');
    return true;
  }

  function stopQrScan() {
    qrScannerActive = false;
    if (qrScannerRafId) {
      cancelAnimationFrame(qrScannerRafId);
      qrScannerRafId = null;
    }
    if (qrScannerStream) {
      qrScannerStream.getTracks().forEach(track => track.stop());
      qrScannerStream = null;
    }
    if (dom.scanQrVideo) {
      dom.scanQrVideo.srcObject = null;
    }
  }

  function openScannerOverlay() {
    if (dom.scanQrOverlay) dom.scanQrOverlay.classList.remove('hidden');
  }

  function closeScannerOverlay() {
    stopQrScan();
    if (dom.scanQrOverlay) dom.scanQrOverlay.classList.add('hidden');
  }

  async function scanQrFrameLoop() {
    if (!qrScannerActive || !dom.scanQrVideo) return;
    try {
      const detector = getQrDetector();
      if (!detector) return;
      const barcodes = await detector.detect(dom.scanQrVideo);
      if (barcodes && barcodes.length > 0) {
        const rawValue = barcodes[0].rawValue || '';
        if (rawValue) {
          let parsed = null;
          try {
            parsed = JSON.parse(rawValue);
          } catch (err) {
            parsed = null;
          }
          if (parsed) {
            const song = extractSongFromParsedData(parsed);
            if (song) {
              populateSongForm(song);
              showToast('Song loaded from QR. Review and save.', 'success');
              stopQrScan();
              closeScannerOverlay();
              return;
            }
          }
        }
      }
    } catch (err) {
      // Ignore transient frame-read errors.
    }
    qrScannerRafId = requestAnimationFrame(scanQrFrameLoop);
  }

  async function startQrScan() {
    const detector = getQrDetector();
    if (!detector) {
      showToast('QR scan not supported on this browser.', 'error');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Camera access is unavailable in this browser.', 'error');
      return;
    }

    stopQrScan();
    try {
      qrScannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (!dom.scanQrVideo) return;
      dom.scanQrVideo.srcObject = qrScannerStream;
      await dom.scanQrVideo.play();
      qrScannerActive = true;
      openScannerOverlay();
      qrScannerRafId = requestAnimationFrame(scanQrFrameLoop);
    } catch (err) {
      showToast('Unable to start camera scan.', 'error');
      stopQrScan();
    }
  }

  async function scanQrFromImageFile(file) {
    if (!file) return;
    closeScannerOverlay();
    const detector = getQrDetector();
    if (!detector) {
      showToast('QR scan not supported on this browser.', 'error');
      return;
    }

    try {
      let detected = [];
      if ('createImageBitmap' in window) {
        const bitmap = await createImageBitmap(file);
        detected = await detector.detect(bitmap);
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      } else {
        const img = new Image();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = dataUrl;
        });
        detected = await detector.detect(img);
      }

      if (!detected || detected.length === 0) {
        showToast('No QR code detected in image.', 'error');
        return;
      }

      const rawValue = detected[0].rawValue || '';
      handleScannedSongQr(rawValue);
    } catch (err) {
      showToast('Failed to scan QR image.', 'error');
    }
  }

  /**
   * Import a single song from a JSON file
   */
  function importSingleSong(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const imported = extractSongFromParsedData(data);
        if (!imported) {
          showToast('Invalid song file', 'error');
          return;
        }

        populateSongForm(imported);
        showToast('Song loaded into form — review and save', 'success');
      } catch (err) {
        showToast('Failed to parse file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Import data from a JSON file
   */
  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.songs || !Array.isArray(data.songs)) {
          showToast('Invalid backup file', 'error');
          return;
        }
        
        // Merge: add new items, update existing if newer
        let addedSongs = 0, addedPlaylists = 0;
        
        data.songs.forEach(imported => {
          const existing = songs.find(s => s.id === imported.id);
          if (!existing) {
            songs.push(imported);
            addedSongs++;
          } else if (imported.updatedAt > (existing.updatedAt || 0)) {
            Object.assign(existing, imported);
            addedSongs++;
          }
        });
        
        if (data.playlists && Array.isArray(data.playlists)) {
          data.playlists.forEach(imported => {
            const existing = playlists.find(p => p.id === imported.id);
            if (!existing) {
              playlists.push(imported);
              addedPlaylists++;
            } else if (imported.updatedAt > (existing.updatedAt || 0)) {
              Object.assign(existing, imported);
              addedPlaylists++;
            }
          });
        }
        
        saveSongs();
        savePlaylists();
        renderSongList();
        renderPlaylistList();
        showToast(`Imported ${addedSongs} songs, ${addedPlaylists} playlists`, 'success');
      } catch (err) {
        showToast('Failed to parse file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEYS.THEME, next);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = next === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }

  /**
   * Load saved theme preference
   */
  function loadTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.textContent = '\u2600\uFE0F';
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    updatePreferencesUI();
  }

  function setNotationPref(pref) {
    notationPref = pref;
    localStorage.setItem(STORAGE_KEYS.NOTATION, pref);
    updatePreferencesUI();
    if (selectedSongId) renderSongDetail();
  }

  function loadNotationPref() {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTATION);
    if (saved) notationPref = saved;
  }

  function openPreferencesModal() {
    document.getElementById('user-dropdown').classList.remove('visible');
    updatePreferencesUI();
    openModalWithFocusTrap($('preferences-modal'));
  }

  function closePreferencesModal() {
    closeModalWithFocusTrap($('preferences-modal'));
  }

  function updatePreferencesUI() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    $('pref-theme-dark').classList.toggle('active', theme === 'dark');
    $('pref-theme-light').classList.toggle('active', theme === 'light');
    $('pref-notation-original').classList.toggle('active', notationPref === 'original');
    $('pref-notation-sharp').classList.toggle('active', notationPref === 'sharp');
    $('pref-notation-flat').classList.toggle('active', notationPref === 'flat');
  }

  /**
   * Focus trap for modal dialogs
   */
  function trapFocus(modalEl) {
    const focusableSelectors = 'button:not([disabled]):not(.hidden), input:not([disabled]):not(.hidden), select:not([disabled]):not(.hidden), textarea:not([disabled]):not(.hidden), [tabindex]:not([tabindex=\"-1\"])';
    const focusables = modalEl.querySelectorAll(focusableSelectors);
    if (focusables.length === 0) return null;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    function handler(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    modalEl.addEventListener('keydown', handler);
    first.focus();
    return handler; // return so we can remove it later
  }

  let activeFocusTrapHandler = null;
  let previouslyFocusedElement = null;

  function openModalWithFocusTrap(modalEl) {
    previouslyFocusedElement = document.activeElement;
    modalEl.classList.remove('hidden');
    // Small delay to allow DOM to render
    setTimeout(() => {
      activeFocusTrapHandler = trapFocus(modalEl.querySelector('.modal-content'));
    }, 50);
  }

  function closeModalWithFocusTrap(modalEl) {
    modalEl.classList.add('hidden');
    if (activeFocusTrapHandler && modalEl.querySelector('.modal-content')) {
      modalEl.querySelector('.modal-content').removeEventListener('keydown', activeFocusTrapHandler);
      activeFocusTrapHandler = null;
    }
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
      previouslyFocusedElement = null;
    }
  }

  /**
   * Save sidebar scroll position
   */
  function saveSidebarScroll() {
    try {
      const scrollTop = dom.songList.scrollTop;
      sessionStorage.setItem(STORAGE_KEYS.SIDEBAR_SCROLL, scrollTop.toString());
    } catch(e) { /* ignore */ }
  }

  /**
   * Restore sidebar scroll position
   */
  function restoreSidebarScroll() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEYS.SIDEBAR_SCROLL);
      if (saved) dom.songList.scrollTop = parseInt(saved, 10);
    } catch(e) { /* ignore */ }
  }

  /**
   * Announce to screen readers
   */
  function announce(message) {
    const el = document.getElementById('sr-announcements');
    if (el) {
      el.textContent = '';
      setTimeout(() => { el.textContent = message; }, 100);
    }
  }

  /**
   * Save current transpose value to the song (persistent)
   */
  function saveTransposeForSong() {
    if (!selectedSongId) return;
    const song = songs.find(s => s.id === selectedSongId);
    if (song) {
      song.transposeSteps = transposeSteps;
      song.updatedAt = Date.now();
      saveSongs();
    }
  }

  /**
   * Insert a character at the current cursor position in a textarea
   */
  function insertCharAtCursor(textarea, char) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + char + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + char.length;
    textarea.focus();
  }

  // ================================================
  // Event Listeners
  // ================================================
  
  function initEventListeners() {
    // Home FAB button
    $('btn-home').addEventListener('click', goHome);

    // Menu toggle
    dom.menuToggle.addEventListener('click', toggleSidebar);
    
    // Tab switching
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.sidebar-content').forEach(c => c.classList.remove('active'));
        $(`${tab}-tab`).classList.add('active');
      });
    });
    
    // Search
    dom.searchInput.addEventListener('input', renderSongList);
    
    // Sort selects
    if (dom.songsSort) {
      dom.songsSort.addEventListener('change', renderSongList);
    }
    if (dom.playlistsSort) {
      dom.playlistsSort.addEventListener('change', renderPlaylistList);
    }
    
    // Song list click
    dom.songList.addEventListener('click', (e) => {
      const item = e.target.closest('.song-item');
      if (item) {
        selectSong(item.dataset.id);
      }
    });
    
    // Playlist list click
    dom.playlistList.addEventListener('click', (e) => {
      const item = e.target.closest('.playlist-item');
      if (item) {
        selectPlaylist(item.dataset.id);
      }
    });
    
    // Playlist songs click
    dom.playlistSongs.addEventListener('click', (e) => {
      // Handle remove button
      const removeBtn = e.target.closest('.btn-remove-song');
      if (removeBtn) {
        e.stopPropagation();
        removeSongFromPlaylist(removeBtn.dataset.id);
        return;
      }
      
      // Ignore clicks on drag handle
      if (e.target.closest('.drag-handle')) return;

      // Handle song click
      const item = e.target.closest('.playlist-song-item');
      if (item) {
        const songId = item.dataset.id;
        const index = parseInt(item.dataset.index, 10);
        selectSong(songId, true, index);
      }
    });
    
    // Font size selector with persistence
    dom.fontSizeSelect.addEventListener('change', (e) => {
      currentFontSize = parseInt(e.target.value, 10);
      localStorage.setItem(STORAGE_KEYS.FONT_SIZE, currentFontSize.toString());
      if (selectedSongId) {
        renderSongDetail();
      }
    });
    
    // Transpose buttons with persistent saving
    dom.transposeUp.addEventListener('click', () => {
      transposeSteps++;
      saveTransposeForSong();
      renderSongDetail();
    });
    
    dom.transposeDown.addEventListener('click', () => {
      transposeSteps--;
      saveTransposeForSong();
      renderSongDetail();
    });
    
    dom.transposeReset.addEventListener('click', () => {
      transposeSteps = 0;
      saveTransposeForSong();
      renderSongDetail();
    });
    
    // Add song button
    $('btn-add-song').addEventListener('click', () => openSongModal());

    // Back to playlist button
    $('btn-back-playlist').addEventListener('click', () => {
      if (selectedPlaylistId) {
        viewingPlaylistSongIndex = -1;
        selectedSongId = null;
        renderPlaylistDetail();
        renderPlaylistList();
        dom.appTitle.textContent = 'Chord Library';
      }
    });
    
    // Export song button
    $('btn-export-song').addEventListener('click', () => {
      if (selectedSongId) exportSingleSong(selectedSongId);
    });

    // Share song via QR button
    $('btn-share-song').addEventListener('click', () => {
      if (selectedSongId) shareSongViaQr(selectedSongId);
    });

    // Edit song button
    $('btn-edit-song').addEventListener('click', () => {
      if (selectedSongId) openSongModal(selectedSongId);
    });
    
    // Delete song button
    $('btn-delete-song').addEventListener('click', () => {
      if (selectedSongId) deleteSong(selectedSongId);
    });
    
    // Song form
    dom.songForm.addEventListener('submit', saveSong);
    $('btn-cancel-song').addEventListener('click', closeSongModal);
    // Note: Backdrop click intentionally not added to prevent accidental closure

    // Import single song in song modal
    const btnImportSong = $('btn-import-song');
    const importSongFile = $('import-song-file');
    const btnScanQr = $('btn-scan-qr');
    const btnStopScanQr = $('btn-stop-scan-qr');
    const btnScanQrImage = $('btn-scan-qr-image');
    const scanQrImageFile = $('scan-qr-image-file');
    if (btnImportSong && importSongFile) {
      btnImportSong.addEventListener('click', () => importSongFile.click());
      importSongFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          importSingleSong(e.target.files[0]);
          e.target.value = '';
        }
      });
    }
    if (btnScanQr) {
      btnScanQr.addEventListener('click', startQrScan);
    }
    if (btnStopScanQr) {
      btnStopScanQr.addEventListener('click', closeScannerOverlay);
    }
    const btnCloseScanner = $('btn-close-scanner');
    if (btnCloseScanner) {
      btnCloseScanner.addEventListener('click', closeScannerOverlay);
    }
    if (btnScanQrImage && scanQrImageFile) {
      btnScanQrImage.addEventListener('click', () => scanQrImageFile.click());
      scanQrImageFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          scanQrFromImageFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // Share QR modal
    const btnCloseShareQr = $('btn-close-share-qr');
    if (btnCloseShareQr) {
      btnCloseShareQr.addEventListener('click', closeShareQrModal);
    }
    if (dom.shareQrModal) {
      const shareBackdrop = dom.shareQrModal.querySelector('.modal-backdrop');
      if (shareBackdrop) {
        shareBackdrop.addEventListener('click', closeShareQrModal);
      }
    }
    
    // Character insert buttons
    $$('.char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const char = btn.dataset.char;
        insertCharAtCursor(dom.songContentInput, char);
      });
    });
    
    // Add playlist button
    $('btn-add-playlist').addEventListener('click', () => openPlaylistModal());
    
    // Edit playlist button
    $('btn-edit-playlist').addEventListener('click', () => {
      if (selectedPlaylistId) openPlaylistModal(selectedPlaylistId);
    });
    
    // Delete playlist button
    $('btn-delete-playlist').addEventListener('click', () => {
      if (selectedPlaylistId) deletePlaylist(selectedPlaylistId);
    });
    
    // Playlist form
    dom.playlistForm.addEventListener('submit', savePlaylist);
    $('btn-cancel-playlist').addEventListener('click', closePlaylistModal);
    dom.playlistModal.querySelector('.modal-backdrop').addEventListener('click', closePlaylistModal);
    
    // Add songs to playlist
    $('btn-add-songs-to-playlist').addEventListener('click', openAddSongsModal);
    $('btn-cancel-add-songs').addEventListener('click', closeAddSongsModal);
    $('btn-confirm-add-songs').addEventListener('click', confirmAddSongs);
    dom.addSongsModal.querySelector('.modal-backdrop').addEventListener('click', closeAddSongsModal);
    
    // Confirm modal
    $('btn-cancel-confirm').addEventListener('click', closeConfirmModal);
    $('btn-confirm-delete').addEventListener('click', executeConfirm);
    dom.confirmModal.querySelector('.modal-backdrop').addEventListener('click', closeConfirmModal);
    
    // Touch events for swipe navigation
    dom.content.addEventListener('touchstart', handleTouchStart, { passive: true });
    dom.content.addEventListener('touchmove', handleTouchMove, { passive: true });
    dom.content.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Close modals on Escape (except song modal to prevent accidental loss of input)
      if (e.key === 'Escape') {
        // Song modal is excluded - only Cancel and Save buttons close it
        if (!dom.playlistModal.classList.contains('hidden')) closePlaylistModal();
        if (!dom.addSongsModal.classList.contains('hidden')) closeAddSongsModal();
        if (!dom.confirmModal.classList.contains('hidden')) closeConfirmModal();
        if (dom.shareQrModal && !dom.shareQrModal.classList.contains('hidden')) closeShareQrModal();
        if (!$('preferences-modal').classList.contains('hidden')) closePreferencesModal();
      }
      
      // Arrow key navigation for playlist songs
      if (viewingPlaylistSongIndex >= 0 && !e.target.matches('input, textarea')) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateToPreviousSong();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateToNextSong();
        }
      }
    });

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    // Preferences
    $('btn-preferences').addEventListener('click', openPreferencesModal);
    $('btn-close-preferences').addEventListener('click', closePreferencesModal);
    $('preferences-modal').querySelector('.modal-backdrop').addEventListener('click', closePreferencesModal);
    $('pref-theme-dark').addEventListener('click', () => setTheme('dark'));
    $('pref-theme-light').addEventListener('click', () => setTheme('light'));
    $('pref-notation-original').addEventListener('click', () => setNotationPref('original'));
    $('pref-notation-sharp').addEventListener('click', () => setNotationPref('sharp'));
    $('pref-notation-flat').addEventListener('click', () => setNotationPref('flat'));

    // Export data
    const btnExport = document.getElementById('btn-export-data');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.remove('visible');
        exportData();
      });
    }

    // Import data
    const btnImport = document.getElementById('btn-import-data');
    const importFileInput = document.getElementById('import-file-input');
    if (btnImport && importFileInput) {
      btnImport.addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.remove('visible');
        importFileInput.click();
      });
      importFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          importData(e.target.files[0]);
          e.target.value = ''; // Reset so same file can be imported again
        }
      });
    }

    // SW update banner
    const btnUpdateRefresh = document.getElementById('btn-update-refresh');
    const btnUpdateDismiss = document.getElementById('btn-update-dismiss');
    if (btnUpdateRefresh) {
      btnUpdateRefresh.addEventListener('click', () => location.reload());
    }
    if (btnUpdateDismiss) {
      btnUpdateDismiss.addEventListener('click', () => {
        document.getElementById('update-banner').classList.add('hidden');
      });
    }

    // Save sidebar scroll position on scroll
    dom.songList.addEventListener('scroll', () => {
      saveSidebarScroll();
    }, { passive: true });
  }

  // ================================================
  // Initialization
  // ================================================
  
  function init() {
    loadData();
    loadTheme();
    loadNotationPref();
    createSwipeIndicators();
    renderSongList();
    renderPlaylistList();
    initEventListeners();
    
    // Load persisted font size
    const savedFontSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
    if (savedFontSize) {
      currentFontSize = parseInt(savedFontSize, 10) || 14;
      if (dom.fontSizeSelect) {
        dom.fontSizeSelect.value = currentFontSize.toString();
      }
    } else if (dom.fontSizeSelect) {
      currentFontSize = parseInt(dom.fontSizeSelect.value, 10) || 14;
    }
    
    // Restore sidebar scroll position
    restoreSidebarScroll();
    
    // Show empty state initially
    dom.emptyState.classList.remove('hidden');
    dom.songDetail.classList.add('hidden');
    dom.playlistDetail.classList.add('hidden');
    renderHomeDashboard();

    // Initialize Firebase sync
    if (typeof SyncService !== 'undefined') {
      SyncService.init();
      SyncService.initDropdown();
      SyncService.onRemoteUpdate(function(type, data) {
        if (type === 'songs') {
          songs = data;
          renderSongList();
          renderSongDetail();
        } else if (type === 'playlists') {
          playlists = data;
          renderPlaylistList();
          if (selectedPlaylistId) renderPlaylistDetail();
        }
      });
    }
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
