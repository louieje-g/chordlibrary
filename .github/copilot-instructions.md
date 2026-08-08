# Chord Library - Copilot Instructions

## Deployment Checklist

Before every deployment, ensure the following:

### 1. Update Cache Busters

Increment the `?v=` query strings in `index.html` for **ALL** files (not just modified ones):
- `css/style.css?v=X.X.X`
- `js/app.js?v=X.X.X`
- `js/sync-service.js?v=X.X.X`
- `js/firebase-config.js?v=X.X.X`
- `js/qrcode.js?v=X.X.X`

All versions must match. Increment them all together to the same version number.

Also update `sw.js`:
- Increment `CACHE_VERSION` (e.g., `'v8'` → `'v9'`)
- Update the `STATIC_ASSETS` array entries to match the new `?v=` values

### 2. Update Feature Tour (if new features were added)

If user-facing features were added in this release:
- Increment `TOUR_VERSION` constant in `js/app.js` (e.g., `'2.0'` → `'2.1'`)
- Add or update `<div class="tour-slide">` elements in the `#tour-slides` section of `index.html`
- Only include NEW features visible to users — not bug fixes, refactors, or internal changes
- Each slide needs: an emoji icon (`tour-slide-icon`), a title (`h3`), and a short description (`p`)
- Remove slides for features that are no longer "new" after multiple releases (keep max 6 slides)

### 3. Update README

Add new features to the Features list in `README.md`.

## Code Conventions

- Vanilla JS (ES6+) inside a single IIFE in `app.js`, no framework, no build step
- CSS custom properties for theming, mobile-first responsive design
- localStorage for persistence, optional Firebase Firestore sync via `sync-service.js`
- All functions inside the IIFE; state as `let` variables at the top
- Use `$('id')` helper for `document.getElementById`
- Use `$$('selector')` helper for `document.querySelectorAll`
- No external dependencies except Firebase SDK (deferred) and `qrcode.js`
- Modals use `openModalWithFocusTrap()` / `closeModalWithFocusTrap()` pattern
- Toast notifications via `showToast(message, type)`

## File Structure

```
index.html          — Single-page app HTML
css/style.css       — All styles (mobile-first, CSS custom properties)
js/app.js           — Main app logic (IIFE)
js/sync-service.js  — Firebase sync service
js/firebase-config.js — Firebase project config
js/qrcode.js       — QR code generation library
sw.js               — Service worker (offline caching)
manifest.json       — PWA manifest
```

## Feature Tour Reference

The tour is controlled by:
- `TOUR_VERSION` constant in `js/app.js` — compared against `localStorage['chord-library-tour-seen']`
- Tour HTML in `index.html` inside `#tour-overlay` → `#tour-slides`
- Tour shows once per version; dismissed by Skip or completing all slides
