# Cueproof

A browser-based caption revision desk for video editors, accessibility reviewers, and small media teams. Compare a reference SRT or WebVTT track with a revision, check the relevant moments, and send back a timecoded review.

[Open Cueproof](https://zephyruszorro.github.io/cueproof/) · [Research](docs/research.md) · [Product design](docs/design.md) · [Verification](docs/verification.md) · [Push milestones](docs/plan.md)

![Cueproof review desk with a synthetic caption revision](docs/screenshots/review.png)

## First review

1. Choose **Open sample**, or select a reference track and revised track for the same video and choose **Compare tracks**.
2. Open a row in **Change queue**. Check wording, timing, split/merge boundaries, settings, and readability advisories. Use **All cues** to inspect rows without changes.
3. Optionally **Attach media**. Switch the caption preview between the reference and revision, then use **Play cue** to listen with a little context.
4. Choose **Accepted** or **Needs changes**, add a note if useful, and **Save decision**. Use **Next unreviewed** to continue.
5. Open **Review handoff** and download a CSV for the editor or a JSON backup to keep working elsewhere.

Cueproof keeps one active review per browser origin. Save a backup before replacing the pair or using **New review → Clear this workspace**. A backup includes both original caption tracks and the saved notes. Media is attached for the current tab and is excluded from exports.

## Run locally

Use Node.js 24 or newer and npm. From this repository:

```sh
npm ci
npm run build
npm run preview -- --port 4187 --strictPort
```

Open [http://127.0.0.1:4187/](http://127.0.0.1:4187/). No account, environment variables, server database, or media service is required. For development, run `npm run dev`. To host it elsewhere, serve the contents of `dist/` on a static HTTPS host. The GitHub Actions workflow tests the release before publishing it to Pages.

## How it works

- **Input.** UTF-8 SRT and WebVTT, with an optional BOM. Each track is limited to 2 MiB, 2,500 cues, and 8,000 code units per cue. Cue starts must be ordered. Structural errors identify the source line. The original file text stays in the review backup.
- **Comparison.** An order-preserving alignment uses timing and normalized text, with inferred shifts and two-part split/merge proposals. Cue order and exact source timings are retained. Check timing-only pairs before accepting them. Reworded splits and non-adjacent rearrangements can appear as separate rows.
- **Review.** Source line numbers, inline word differences, per-cue timing, and advisory duration, reading-speed, line-length, and overlap checks. Browser media support depends on the codec. The preview shows plain caption text, while presentation data is available as evidence in the inspector and handoff.
- **Privacy.** Parsing, comparison, and playback occur in the tab. IndexedDB stores tracks and decisions locally. The production content policy blocks network connections from the app. Browser storage can be cleared or evicted. The GitHub Pages origin can be shared with other projects under the same account, so the loopback launch provides a separate storage origin.
- **Scope.** Use the video and a human reviewer to verify accuracy, meaningful sounds, speaker labels, placement, and sync. Advisories are guides, and this release covers a subset of the caption formats.

## Open source

MIT application code. Vite and TypeScript build the static frontend. [jsdiff](https://github.com/kpdecker/jsdiff) provides the inline word diff under BSD-3-Clause. Inter and Space Grotesk ship as local fonts under OFL-1.1. The parser, alignment, review workflow, and storage are original to this project. [Third-party notices](public/third-party-notices.txt)

## Future directions

- Carry exact-match review decisions forward when an editor delivers a third revision.
- Support manual pairing and split/merge overrides for heavily reworked tracks.
- Let reviewers recheck a previous handoff against a new export and see which requested changes were addressed.
