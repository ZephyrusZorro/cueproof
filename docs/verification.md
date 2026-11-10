# Verification and release notes

## Review passes

| Pass | Evidence or change |
| --- | --- |
| Functionality | Imported real mixed SRT/WebVTT fixtures, played local WAV and WebM, compared both tracks, saved decisions, reloaded, downloaded a handoff, cleared the workspace and restored the backup. |
| Engineering | Reviewed by a separate agent. Corrected partial offset alignment, nested split range math, missing individual cue boundaries and presentation evidence, replacement races, and stale-save guidance. Regression tests cover each material path. |
| Usability | Invalid file and backup messages preserve the active review. Dirty decisions stay in place until saved or discarded. Timecode search includes both tracks. |
| Visual and accessibility | Inspected the start screen and review at desktop and mobile widths. Exercised keyboard entry, focus, and reflow at 320, 390, 768 and 1,440 px. Automated axe scans on start and review reported zero violations in the selected WCAG 2.0/2.1 A and AA rules. |
| Performance and resilience | Benchmarked parsing and alignment at the 2,500-cue-per-track limit. Concurrent IndexedDB writes use a token checked inside the write transaction. Malformed UTF-8, markup and spreadsheet formula inputs have targeted tests. |
| Competitive fit | Subtitle Edit remains the deeper editor. Cueproof's review queue, persistent decisions and local playback work with SRT/WebVTT files exported from other tools. The user can hand back a timecoded record while the editor keeps using their existing tool. |

## Commands

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run benchmark
npm audit --audit-level=moderate
```

On Windows with Edge installed, set `$env:CUEPROOF_BROWSER_CHANNEL='msedge'` before the browser command to use Edge.

The controlled Windows run on Node 24.20.0 parsed and compared two 2,500-cue synthetic tracks in a median of 136.6 ms over seven measured runs after one warmup. The slowest measured run was 305.1 ms. This is a Node benchmark on generated captions. Browser interaction speed depends on device and input, and no competitor performance comparison was made.

## Scope of evidence

The test corpus is synthetic. No field pilot, formal accessibility conformance audit, or comprehensive browser and codec matrix was performed. The parser and readability checks cover the documented Cueproof subset. A human reviewer must still check accuracy, synchronization, speaker labels and meaningful sounds.
