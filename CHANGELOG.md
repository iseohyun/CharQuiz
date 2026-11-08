# CharQuiz Changelog

All notable changes to the CharQuiz project will be documented in this file.

## [v1.0.5] - 2026-08-24
### Added & Improved
- **Dynamic 10s 360-Degree Gradient Rotation**:
  - Implemented `@property --gradient-angle` with `inherits: true` and `:root` synchronization to smoothly rotate gradient backgrounds across all mode buttons and header badges in a 10-second continuous loop.
- **Spectator Mode (LIVE) Pause / Resume & Confirmation Integration**:
  - Enabled Pause / Resume button in Spectator mode to halt/resume the auto-advancing char loop, timer, and pronunciation audio seamlessly.
  - Unified session exit flow across all modes with prompt confirmation on Stop button click and ESC key press.
- **Dual-Tier Cache-Busting (20260824v1) & SemVer (v1.0.5)**:
  - Added timestamp-based cache-busting query tags (`20260824v1`) for immediate asset refresh alongside formal semantic versioning.

## [v1.0.4] - 2026-08-24
### Added & Improved
- **Top Header Quiz Control Integration**:
  - Relocated mode badge & session control buttons directly into the unused space of the top header (`.user-profile-box`), eliminating the in-game quiz header and expanding vertical workspace for quiz questions & options.
- **Session Abort (Stop) Button & Confirmation Flow**:
  - Added dedicated Stop (`close` icon) button alongside the Pause button in the top header.
  - Pauses timer/audio and presents a confirmation dialog (`confirm`) to safely exit sessions to the main screen without accidental data loss.
- **Progress Table Overdue Red Border in All Modes**:
  - Enabled red highlighting border (`2px solid #F44336`) for overdue forgetting-curve review items in both Response Speed mode and Stage mode.
- **Real-Time Review Count Badge Sync**:
  - Enhanced `updateReviewCountBadge()` to support multi-type index lookups and automatically recalculate pending review counts upon session termination and domain switching.

## [v1.0.3] - 2026-08-24
### Added & Improved
- **Quiz Layout 100% Fit & Anti-Cutoff**:
  - Re-architected `.options-grid` into a dynamic 2x2 responsive grid (`grid-template-rows: repeat(2, 1fr)`, `clamp` font sizing) to guarantee all 4 multiple-choice options are 100% visible on any screen size.
  - Streamlined `#main-box`, `#audio-trigger`, and `.dashboard` paddings to eliminate overflow and viewport clipping on small displays.
- **Quiz Pause / Resume Engine**:
  - Upgraded pause button into a toggle mechanism: halts session timer and audio, switches icon to `play_arrow`, and resumes quiz smoothly upon second click.
  - Eliminated disruptive browser modal alerts (`alert()`, `prompt()`, automatic leaderboard popup) upon session completion for a seamless learning flow.
- **Header & Modal UX Refinement**:
  - Integrated Help icon (`?`) in Settings modal header with automatic return-to-settings routing upon closing.
  - Removed Help item from the main header and relocated Settings icon to the far right.
  - Added SVG favicon meta tag to eliminate 404 `/favicon.ico` errors.
- **FCM Push Notification Stability**:
  - Resolved PushManager AbortError by waiting for `navigator.serviceWorker.ready` before acquiring FCM tokens.
  - Added `skipWaiting` and `clients.claim` to `firebase-messaging-sw.js` for instant worker activation.

## [v1.0.2] - 2026-08-08
### Changed & Improved
- **Local-First (Browser-First) Architecture & DB Optimization**:
  - **0ms Instant Startup & Caching**: Restores state from `localStorage` immediately, saving up to 100% of unnecessary Firestore read queries.
  - **Lazy Batch Sync**: Eliminates real-time DB writes per question; batches updates into a single `writeBatch` request upon session completion (90%+ DB write cost reduction).
  - **Smart Bidirectional Timestamp Merging**: Performs item-level timestamp comparison to seamlessly merge server & local progress without data loss.
  - **Self-Healing Fallback**: Gracefully handles network/security rule errors via local fallback.
- **Modal UI & UX Refinement**:
  - **Non-Overlapping Modal Header (`.modal-header`)**: Re-architected modal dialogs with flexbox layout for title & close button (`&times;`), eliminating overlapping issues with content elements.
  - **Hidden Scrollbar Styling**: Visually hides scrollbar track (`::-webkit-scrollbar { display: none; }`, `scrollbar-width: none`) while retaining smooth scrolling capabilities.

## [v1.0.1] - 2026-08-08
### Changed
- **Modern Design System Overhaul**:
  - Implemented glassmorphism header backdrop with smooth hover transitions.
  - Replaced legacy monochrome buttons with interactive 3D gradient cards (Study, Record, Spectator modes).
  - Integrated Google Fonts (`Outfit`, `Noto Sans KR`, `Noto Sans JP`) for refined Korean & Japanese typography.
  - Added CharQuiz Quick Info Card and enhanced modal dialog styling (rounded corners, backdrop blur, fade animations).
- **Architecture & Template Sync**:
  - Updated `MAIN_SELECTION_HTML` template in `main.js` to synchronize dynamic JavaScript rendering with the new 3D card layout.
  - Added fallback CSS gradient declarations for `.mode-btn` component.
