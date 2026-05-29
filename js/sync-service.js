/**
 * Sync Service - Firebase Authentication & Firestore Synchronization
 * Handles Google sign-in, bidirectional sync, offline queue, and conflict resolution.
 */

const SyncService = (function () {
  'use strict';

  // ================================================
  // Constants (shared with app.js)
  // ================================================

  const STORAGE_KEYS = {
    SONGS: 'chord-library-songs',
    PLAYLISTS: 'chord-library-playlists',
    SYNC_QUEUE: 'chord-library-sync-queue',
    LAST_SYNCED: 'chord-library-last-synced'
  };

  const MAX_BATCH_SIZE = 499; // Firestore limit is 500 operations per batch

  // ================================================
  // State
  // ================================================

  const SYNC_QUEUE_KEY = STORAGE_KEYS.SYNC_QUEUE;
  const LAST_SYNCED_KEY = STORAGE_KEYS.LAST_SYNCED;

  let db = null;
  let auth = null;
  let currentUser = null;
  let syncStatus = 'offline'; // 'idle' | 'syncing' | 'error' | 'offline'
  let syncInProgress = false;
  let remoteUpdateCallback = null;
  let statusChangeCallback = null;
  let retryTimer = null;
  let initialized = false;

  // ================================================
  // Initialization
  // ================================================

  function init() {
    if (initialized) return;

    // Check if Firebase SDK is loaded and configured
    if (typeof firebase === 'undefined') {
      console.warn('SyncService: Firebase SDK not loaded. Online sync disabled.');
      setStatus('offline');
      return;
    }

    // Check if the config has been filled in
    if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      console.warn('SyncService: Firebase not configured. Online sync disabled.');
      setStatus('offline');
      return;
    }

    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();

      // Enable offline persistence
      db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        if (err.code === 'failed-precondition') {
          console.warn('SyncService: Multiple tabs open, persistence only in one.');
        } else if (err.code === 'unimplemented') {
          console.warn('SyncService: Browser does not support persistence.');
        }
      });

      // Set auth persistence
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

      // Listen for auth state changes
      auth.onAuthStateChanged(handleAuthStateChanged);

      // Listen for online/offline events
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      if (!navigator.onLine) {
        setStatus('offline');
      }

      initialized = true;
    } catch (e) {
      console.error('SyncService: Failed to initialize Firebase:', e);
      setStatus('error');
    }
  }

  // ================================================
  // Authentication
  // ================================================

  function handleAuthStateChanged(user) {
    currentUser = user;
    updateAuthUI();

    if (user) {
      setStatus(navigator.onLine ? 'idle' : 'offline');
      // Sync on sign-in
      if (navigator.onLine) {
        syncAll();
      }
    } else {
      setStatus('offline');
    }
  }

  function signIn() {
    if (!auth) {
      console.warn('SyncService: Firebase not initialized.');
      return Promise.reject(new Error('Firebase not initialized'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).catch(function (error) {
      console.error('SyncService: Sign-in failed:', error);
      showToast('Sign-in failed: ' + error.message, 'error');
    });
  }

  function signOut() {
    if (!auth) return Promise.resolve();
    return auth.signOut().then(function () {
      currentUser = null;
      setStatus('offline');
      updateAuthUI();
      showToast('Signed out', 'info');
    }).catch(function (error) {
      console.error('SyncService: Sign-out failed:', error);
    });
  }

  function getUser() {
    return currentUser;
  }

  function isSignedIn() {
    return !!currentUser;
  }

  // ================================================
  // Auth UI Updates
  // ================================================

  function updateAuthUI() {
    var userBtn = document.getElementById('user-btn');
    var userAvatar = document.getElementById('user-avatar');
    var userIcon = document.getElementById('user-icon');
    var dropdownName = document.getElementById('user-dropdown-name');
    var dropdownEmail = document.getElementById('user-dropdown-email');
    var signInBtn = document.getElementById('btn-sign-in');
    var signOutBtn = document.getElementById('btn-sign-out');

    if (!userBtn) return;

    if (currentUser) {
      // Signed in
      if (currentUser.photoURL && userAvatar) {
        userAvatar.src = currentUser.photoURL;
        userAvatar.classList.remove('hidden');
        if (userIcon) userIcon.classList.add('hidden');
      }
      if (dropdownName) dropdownName.textContent = currentUser.displayName || 'User';
      if (dropdownEmail) dropdownEmail.textContent = currentUser.email || '';
      if (signInBtn) signInBtn.classList.add('hidden');
      if (signOutBtn) signOutBtn.classList.remove('hidden');
      userBtn.title = 'Account: ' + (currentUser.displayName || currentUser.email);
    } else {
      // Signed out
      if (userAvatar) userAvatar.classList.add('hidden');
      if (userIcon) userIcon.classList.remove('hidden');
      if (dropdownName) dropdownName.textContent = 'Not signed in';
      if (dropdownEmail) dropdownEmail.textContent = '';
      if (signInBtn) signInBtn.classList.remove('hidden');
      if (signOutBtn) signOutBtn.classList.add('hidden');
      userBtn.title = 'Sign in to sync';
    }
  }

  // ================================================
  // Sync Status
  // ================================================

  function setStatus(status) {
    syncStatus = status;
    updateSyncIndicator();
    if (statusChangeCallback) {
      statusChangeCallback(status);
    }
  }

  function updateSyncIndicator() {
    var indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    // Reset class - use mini version for the new design
    indicator.className = 'sync-indicator-mini';
    switch (syncStatus) {
      case 'idle':
        indicator.classList.add('synced');
        indicator.title = 'Synced';
        indicator.textContent = '';
        break;
      case 'syncing':
        indicator.classList.add('syncing');
        indicator.title = 'Syncing…';
        indicator.textContent = '';
        break;
      case 'error':
        indicator.classList.add('sync-error');
        indicator.title = 'Sync error';
        indicator.textContent = '';
        break;
      case 'offline':
      default:
        indicator.classList.add('offline');
        indicator.title = currentUser ? 'Offline' : 'Not signed in';
        indicator.textContent = '';
        break;
    }
  }

  // ================================================
  // Core Sync Logic
  // ================================================

  function syncAll() {
    if (!currentUser || !db || syncInProgress) return Promise.resolve();
    if (!navigator.onLine) {
      setStatus('offline');
      return Promise.resolve();
    }

    syncInProgress = true;
    setStatus('syncing');

    var userId = currentUser.uid;

    // Sync songs first (playlists reference songIds)
    return syncCollection('songs', userId)
      .then(function () {
        return syncCollection('playlists', userId);
      })
      .then(function () {
        // Flush any queued offline changes
        return flushQueue();
      })
      .then(function () {
        localStorage.setItem(LAST_SYNCED_KEY, Date.now().toString());
        setStatus('idle');
        syncInProgress = false;
        showToast('Synced', 'success');
      })
      .catch(function (error) {
        console.error('SyncService: Sync failed:', error);
        setStatus('error');
        syncInProgress = false;
        scheduleRetry();
      });
  }

  /**
   * Commit items in chunked batches to respect Firestore's 500-operation limit.
   */
  function commitInBatches(collectionRef, items) {
    if (items.length === 0) return Promise.resolve();

    var chunks = [];
    for (var i = 0; i < items.length; i += MAX_BATCH_SIZE) {
      chunks.push(items.slice(i, i + MAX_BATCH_SIZE));
    }

    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        var batch = db.batch();
        chunk.forEach(function (item) {
          var docRef = collectionRef.doc(item.id);
          batch.set(docRef, item);
        });
        return batch.commit();
      });
    }, Promise.resolve());
  }

  function syncCollection(type, userId) {
    var collectionRef = db.collection('users').doc(userId).collection(type);
    var localItems = getLocalData(type);

    return collectionRef.get().then(function (snapshot) {
      var remoteItems = [];
      snapshot.forEach(function (doc) {
        var data = Object.assign({}, doc.data(), { id: doc.id });
        remoteItems.push(data);
      });

      var merged = mergeData(localItems, remoteItems);

      // Save merged data locally
      setLocalData(type, merged.local);

      // Push changes to Firestore in chunked batches
      return commitInBatches(collectionRef, merged.toUpload);
    });
  }

  // ================================================
  // Merge Logic (Last-Modified-Wins)
  // ================================================

  function mergeData(localItems, remoteItems) {
    var localMap = {};
    var remoteMap = {};
    var toUpload = [];
    var merged = [];

    localItems.forEach(function (item) {
      localMap[item.id] = item;
    });

    remoteItems.forEach(function (item) {
      remoteMap[item.id] = item;
    });

    // All known IDs
    var allIds = {};
    Object.keys(localMap).forEach(function (id) { allIds[id] = true; });
    Object.keys(remoteMap).forEach(function (id) { allIds[id] = true; });

    Object.keys(allIds).forEach(function (id) {
      var local = localMap[id];
      var remote = remoteMap[id];

      if (local && !remote) {
        // Only exists locally — upload it
        merged.push(local);
        toUpload.push(local);
      } else if (!local && remote) {
        // Only exists remotely — download it
        if (!remote.deleted) {
          merged.push(remote);
        }
        // If remote is deleted and we don't have it, just skip
      } else {
        // Exists in both — last modified wins
        var localTime = local.updatedAt || local.createdAt || 0;
        var remoteTime = remote.updatedAt || remote.createdAt || 0;

        if (remoteTime > localTime) {
          // Remote wins
          if (!remote.deleted) {
            merged.push(remote);
          }
          // If remote deleted, don't add to local
        } else if (localTime > remoteTime) {
          // Local wins — upload it
          merged.push(local);
          toUpload.push(local);
        } else {
          // Same timestamp — keep local, no upload needed
          if (!local.deleted) {
            merged.push(local);
          }
        }
      }
    });

    // Filter out soft-deleted items from local storage
    var localResult = merged.filter(function (item) {
      return !item.deleted;
    });

    return { local: localResult, toUpload: toUpload };
  }

  // ================================================
  // Data Change Handlers (called by app.js)
  // ================================================

  function onDataChanged(type, data) {
    if (!currentUser || !db) return;

    if (!navigator.onLine) {
      queueChange(type, data);
      return;
    }

    setStatus('syncing');
    var userId = currentUser.uid;
    var collectionRef = db.collection('users').doc(userId).collection(type);

    commitInBatches(collectionRef, data)
      .then(function () {
        setStatus('idle');
      })
      .catch(function (error) {
        console.error('SyncService: Push failed for ' + type + ':', error);
        queueChange(type, data);
        setStatus('error');
        scheduleRetry();
      });
  }

  function onItemDeleted(type, item) {
    if (!currentUser || !db) return;

    // Create tombstone
    var tombstone = Object.assign({}, item, {
      deleted: true,
      updatedAt: Date.now()
    });

    if (!navigator.onLine) {
      queueChange(type, [tombstone]);
      return;
    }

    setStatus('syncing');
    var userId = currentUser.uid;
    var docRef = db.collection('users').doc(userId).collection(type).doc(item.id);

    docRef.set(tombstone)
      .then(function () {
        setStatus('idle');
      })
      .catch(function (error) {
        console.error('SyncService: Delete sync failed:', error);
        queueChange(type, [tombstone]);
        setStatus('error');
        scheduleRetry();
      });
  }

  // ================================================
  // Offline Queue
  // ================================================

  function queueChange(type, data) {
    var queue = getQueue();
    queue.push({
      type: type,
      data: data,
      timestamp: Date.now()
    });
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  }

  function getQueue() {
    try {
      var raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function flushQueue() {
    var queue = getQueue();
    if (queue.length === 0 || !currentUser || !db) return Promise.resolve();

    var userId = currentUser.uid;

    // Group all items by type, then commit in batches
    var grouped = {};
    queue.forEach(function (entry) {
      if (!grouped[entry.type]) grouped[entry.type] = [];
      entry.data.forEach(function (item) {
        grouped[entry.type].push(item);
      });
    });

    var typeKeys = Object.keys(grouped);
    return typeKeys.reduce(function (chain, type) {
      return chain.then(function () {
        var collectionRef = db.collection('users').doc(userId).collection(type);
        return commitInBatches(collectionRef, grouped[type]);
      });
    }, Promise.resolve())
      .then(function () {
        localStorage.removeItem(SYNC_QUEUE_KEY);
      })
      .catch(function (error) {
        console.error('SyncService: Failed to flush queue:', error);
        throw error;
      });
  }

  // ================================================
  // Retry Logic
  // ================================================

  let retryCount = 0;
  const MAX_RETRIES = 3;

  function scheduleRetry() {
    if (retryCount >= MAX_RETRIES) {
      console.warn('SyncService: Max retries reached.');
      return;
    }
    if (retryTimer) clearTimeout(retryTimer);

    var delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
    retryCount++;

    retryTimer = setTimeout(function () {
      if (navigator.onLine && currentUser) {
        syncAll().then(function () {
          retryCount = 0;
        });
      }
    }, delay);
  }

  // ================================================
  // Online/Offline Handlers
  // ================================================

  function handleOnline() {
    if (currentUser) {
      retryCount = 0;
      syncAll();
    }
  }

  function handleOffline() {
    setStatus('offline');
  }

  // ================================================
  // Local Data Accessors (reads from localStorage)
  // ================================================

  function getLocalData(type) {
    try {
      var key = type === 'songs' ? STORAGE_KEYS.SONGS : STORAGE_KEYS.PLAYLISTS;
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setLocalData(type, data) {
    try {
      var key = type === 'songs' ? STORAGE_KEYS.SONGS : STORAGE_KEYS.PLAYLISTS;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('SyncService: Failed to write local data:', e);
      showToast('Storage full — some data may not be saved', 'error');
    }

    // Notify app.js to reload UI
    if (remoteUpdateCallback) {
      remoteUpdateCallback(type, data);
    }
  }

  // ================================================
  // Toast Notifications
  // ================================================

  function showToast(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });

    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // ================================================
  // Callbacks
  // ================================================

  function onRemoteUpdate(callback) {
    remoteUpdateCallback = callback;
  }

  function onStatusChange(callback) {
    statusChangeCallback = callback;
  }

  // ================================================
  // User Dropdown Toggle
  // ================================================

  function initDropdown() {
    var userBtn = document.getElementById('user-btn');
    var dropdown = document.getElementById('user-dropdown');
    if (!userBtn || !dropdown) return;

    userBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('visible');
    });

    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && e.target !== userBtn) {
        dropdown.classList.remove('visible');
      }
    });

    var signInBtn = document.getElementById('btn-sign-in');
    var signOutBtn = document.getElementById('btn-sign-out');

    if (signInBtn) {
      signInBtn.addEventListener('click', function () {
        dropdown.classList.remove('visible');
        signIn();
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', function () {
        dropdown.classList.remove('visible');
        signOut();
      });
    }
  }

  // ================================================
  // Public API
  // ================================================

  return {
    init: init,
    initDropdown: initDropdown,
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    isSignedIn: isSignedIn,
    syncAll: syncAll,
    onDataChanged: onDataChanged,
    onItemDeleted: onItemDeleted,
    onRemoteUpdate: onRemoteUpdate,
    onStatusChange: onStatusChange,
    showToast: showToast
  };
})();
