# Cueproof product design

Independent video editors, communications staff, and accessibility reviewers often receive a revised caption file shortly before publication. Cueproof makes that handoff inspectable. Open an approved or earlier track and the incoming revision, review the change queue against the source media when available, and return a timecoded action list.

## Experience

- Start a review from two local UTF-8 SRT or WebVTT files, or open a labelled synthetic example. A rejected input identifies the file and line. The current review survives a failed replacement.
- Inspect paired cues, insertions, removals, likely splits/merges, and track metadata. Use file text, exact time deltas, optional inline text differences, and advisory readability checks. Matching is heuristic and the row shows the evidence.
- Attach a local audio or video file, select the reference or revised preview track, and seek to a cue. Media remains in memory for the current tab.
- Mark each row accepted or needing changes, with an optional note. Reopen the review in the same browser. Export a portable JSON review and a CSV handoff that can be filtered in a spreadsheet. Import validates original tracks and reconstructs rows. A new track pair begins a fresh review.
- Finish with a clear count of unreviewed rows and requested changes. Reviewers assess accuracy, speakers, meaningful sounds, and sync against media. Automated findings are advisory.

## Architecture and alternatives

A static TypeScript app with Vite has a small deployment surface and can inspect local files without an upload. Native DOM, File, media and IndexedDB APIs cover the principal workflow. A desktop wrapper would add platform packaging and distribution. A hosted database would enable simultaneous review but introduce account management and sensitive file custody. Both would add setup for the first use case.

Pure domain modules parse tracks, match cues, surface findings and serialize handoffs. Input limits are 2 MiB, 2,500 cues per track, 8,000 code units per cue, and 500 code units per note. Use UTF-8 with optional BOM. A bounded order-preserving alignment uses normalized text and time evidence. A consistent offset can inform pairing while retaining real deltas. Split/merge proposals cover adjacent pairs with identical normalized text in context. Malformed cue structures are rejected before the review is replaced.

IndexedDB stores a versioned snapshot per origin, with compare-and-swap writes so another tab's edits cannot be overwritten silently. Explicit file exports support moving and archiving work. Imported text is inserted as text, and external requests are unnecessary for operation. Static hosting can use GitHub Pages. Build infrastructure needs Node 24 or newer and npm. Browser support depends on modern File, IndexedDB, and media APIs.

## Acceptance

A reviewer can import mixed formats, find a renumbered insert and a genuine split, see text and millisecond changes, play media from a selected cue, save decisions across reload, export a valid CSV and round-trip a JSON review, and recover from bad imports without losing the active review. The desktop and mobile layout keeps all actions reachable. Verify security with crafted caption markup, CSV formulas, malformed backup data, and concurrent saves. Check performance on a synthetic 2,500-cue pair. Run the workflow in a real browser before release.

Scope: one active review per browser origin, same-video/same-language revisions, browser-supported codecs, and advisory checks. Review backup includes the two subtitle tracks and notes and should be shared accordingly.
