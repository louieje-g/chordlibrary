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
    PLAYLISTS: 'chord-library-playlists'
  };

  // Musical notes for transposition
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  // Regex for matching chord patterns
  const QUALITY = '(?:m(?:aj)?|M(?:aj)?|min|dim|aug|sus[24]?|add|\\d)[a-z0-9]*';
  const CHORD_RE = () => new RegExp(
    `(?<![A-Za-z])([A-G]#?)(${QUALITY})?(\\/[A-G]#?(?:${QUALITY})?)?(?![a-zA-Z0-9#])`,
    'g'
  );

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
    songTitle: $('song-title'),
    songArtist: $('song-artist'),
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
      console.error('Error saving songs:', e);
    }
  }

  function savePlaylists() {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
      if (typeof SyncService !== 'undefined') {
        SyncService.onDataChanged('playlists', playlists);
      }
    } catch (e) {
      console.error('Error saving playlists:', e);
    }
  }

  // ================================================
  // Transposition Functions
  // ================================================
  
  /**
   * Transpose a single note by the given number of steps
   */
  function transposeNote(note, steps) {
    const index = NOTES.indexOf(note);
    if (index === -1) return note;
    return NOTES[((index + steps) % 12 + 12) % 12];
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
        const match = slash.match(/^\/([A-G]#?)(.*)/);
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
   * Highlight chords in text with HTML spans
   */
  function highlightChords(text) {
    if (!text) return '';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(CHORD_RE(), '<span class="chord">$&</span>');
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
          (s.artist && s.artist.toLowerCase().includes(query)))
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

  function renderSongDetail() {
    const song = songs.find(s => s.id === selectedSongId);
    if (!song) {
      dom.emptyState.classList.remove('hidden');
      dom.songDetail.classList.add('hidden');
      dom.playlistDetail.classList.add('hidden');
      // Reset header title
      dom.appTitle.textContent = 'Chord Library';
      return;
    }

    dom.emptyState.classList.add('hidden');
    dom.songDetail.classList.remove('hidden');
    dom.playlistDetail.classList.add('hidden');

    // Update header title: show playlist name when viewing from a playlist, otherwise default
    if (selectedPlaylistId && viewingPlaylistSongIndex >= 0) {
      const playlist = playlists.find(p => p.id === selectedPlaylistId);
      dom.appTitle.textContent = playlist ? playlist.name : 'Chord Library';
    } else {
      dom.appTitle.textContent = 'Chord Library';
    }

    // Update song info
    const transposedTitle = transposeSteps !== 0 
      ? `${song.title} (${transposeSteps > 0 ? '+' : ''}${transposeSteps})`
      : song.title;
    dom.songTitle.textContent = transposedTitle;
    dom.songArtist.textContent = song.artist || '';

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
      <li class="playlist-song-item" data-id="${song.id}" data-index="${index}">
        <div class="playlist-song-info">
          <div class="playlist-song-title">${escapeHtml(song.title)}</div>
          ${song.artist ? `<div class="playlist-song-artist">${escapeHtml(song.artist)}</div>` : ''}
        </div>
        <button class="btn-remove-song" data-id="${song.id}" title="Remove from playlist">✕</button>
      </li>
    `).join('');
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
    
    renderSongList();
    renderSongDetail();
    closeSidebar();
  }

  function openSongModal(songId = null) {
    editingSongId = songId;
    
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
    
    dom.songModal.classList.remove('hidden');
    setTimeout(() => dom.songTitleInput.focus(), 100);
  }

  function closeSongModal() {
    dom.songModal.classList.add('hidden');
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
        // Sync tombstone before removing locally
        if (typeof SyncService !== 'undefined') {
          SyncService.onItemDeleted('songs', song);
        }

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
    
    dom.playlistModal.classList.remove('hidden');
    setTimeout(() => dom.playlistNameInput.focus(), 100);
  }

  function closePlaylistModal() {
    dom.playlistModal.classList.add('hidden');
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
        // Sync tombstone before removing locally
        if (typeof SyncService !== 'undefined') {
          SyncService.onItemDeleted('playlists', playlist);
        }

        playlists = playlists.filter(p => p.id !== id);
        savePlaylists();
        
        if (selectedPlaylistId === id) {
          selectedPlaylistId = null;
        }
        
        renderPlaylistList();
        dom.emptyState.classList.remove('hidden');
        dom.playlistDetail.classList.add('hidden');
      }
    );
  }

  function openAddSongsModal() {
    if (!selectedPlaylistId) return;
    
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    dom.songSelector.innerHTML = songs.map(song => `
      <label class="song-selector-item">
        <input type="checkbox" value="${song.id}" ${playlist.songIds.includes(song.id) ? 'checked' : ''}>
        <div class="song-selector-info">
          <div class="song-selector-title">${escapeHtml(song.title)}</div>
          ${song.artist ? `<div class="song-selector-artist">${escapeHtml(song.artist)}</div>` : ''}
        </div>
      </label>
    `).join('');
    
    dom.addSongsModal.classList.remove('hidden');
  }

  function closeAddSongsModal() {
    dom.addSongsModal.classList.add('hidden');
  }

  function confirmAddSongs() {
    if (!selectedPlaylistId) return;
    
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;
    
    const checkboxes = dom.songSelector.querySelectorAll('input[type="checkbox"]');
    const selectedIds = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    
    playlist.songIds = selectedIds;
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
    dom.confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    dom.confirmModal.classList.add('hidden');
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
      
      // Handle song click
      const item = e.target.closest('.playlist-song-item');
      if (item) {
        const songId = item.dataset.id;
        const index = parseInt(item.dataset.index, 10);
        selectSong(songId, true, index);
      }
    });
    
    // Font size selector
    dom.fontSizeSelect.addEventListener('change', (e) => {
      currentFontSize = parseInt(e.target.value, 10);
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
  }

  // ================================================
  // Initialization
  // ================================================
  
  function init() {
    loadData();
    createSwipeIndicators();
    renderSongList();
    renderPlaylistList();
    initEventListeners();
    
    // Initialize font size from dropdown
    if (dom.fontSizeSelect) {
      currentFontSize = parseInt(dom.fontSizeSelect.value, 10) || 14;
    }
    
    // Show empty state initially
    dom.emptyState.classList.remove('hidden');
    dom.songDetail.classList.add('hidden');
    dom.playlistDetail.classList.add('hidden');

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
