# Verification and release notes

## Version 2 stage audits

| Stage | Reproduction and correction | Gate |
| --- | --- | --- |
| Input | A literal arrow in a valid SRT caption was mistaken for a missing separator. The parser now checks for timing-shaped lines in SRT payloads. | Parser regression, full unit suite and build |
| Request model | A track-level request initially lost its original presentation excerpt. Preserve the excerpt and keep ambiguous or missing cue requests visible. | Missing, unchanged, split/merge, repeated wording, track metadata, and human-resolution tests |
| Storage and exports | An early round-trip dropped follow-up rows, and saving a decision could not retain an archive. The v2 codec now validates request identities and restores their evidence. The IndexedDB write handles both snapshots atomically. | Legacy backup, malformed links, CSV evidence and stale transaction tests |
| Review desk | Tested incomplete edits, invalid returned files, modal dismissal during reads, mobile focus, retained media, and previous-round downloads. Added a returned sample so new reviewers can try the full workflow. | Full Edge suite and automated accessibility checks |
| Release audit | An independent review reproduced an unchanged nearby repeat being labelled as a return, a tentative match hiding a newly returned cue, loss of linked evidence after repeated splits, and excessive CSV growth. Exact reappearance evidence now requires a newly added or reworded candidate. Expanded links survive within the round limit. Oversized CSVs offer a JSON fallback. | Reproductions passed as regression tests. Also checked canonical backup IDs, unreviewed-row warnings and playback around an original request time. |
| CI release gate | The first GitHub run exposed a race in the media test. Programmatic file selection could run while the desk was hidden, and opening the new review then cleared the test attachment. A deliberately delayed caption read reproduced the failure. The test now waits for the visible desk before attaching media. | Delayed-import regression and real invalid-MP4 and valid-WebM checks |

The controlled v2 benchmark on Windows and Node 24.20.0 used seven measured runs after one warmup. Comparing two synthetic 2,500-cue tracks took 135.8 ms median. Parsing the returned track, comparing it, carrying 250 requests, and encoding the next backup took 148.8 ms median. Measurements exclude browser rendering, persistence, and playback.

## Baseline review passes

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

## Scope of evidence

The test corpus is synthetic. No field pilot, formal accessibility conformance audit, or comprehensive browser and codec matrix was performed. The parser and readability checks cover the documented Cueproof subset. A human reviewer must still check accuracy, synchronization, speaker labels and meaningful sounds.
