# Cueproof implementation plan

**Goal** Give a reviewer a complete, private, timecoded caption revision workflow.

**Architecture** Pure parsing, alignment and review modules with a static browser desk, native playback and versioned IndexedDB.

**Spec** [Product design](design.md)

| Push | Files and contract | Verification |
| --- | --- | --- |
| 1. Discovery | Research, design, milestone plan, license | Inspect sources and publish project scope |
| 2. Track reader | package, build config, track.ts | Test malformed source lines, BOM/UTF-8, WebVTT metadata and limits |
| 3. Comparison | compare.ts, findings.ts | Test insert/delete, exact time, resegmentation, repeated text, drift, warning-only overlaps and bounded input |
| 4. Review state | review.ts, storage.ts | Test dispositions, export/restore, hostile text and stale tab writes |
| 5. Review desk | index.html, main.ts, desk.ts, CSS, sample | Verify import, keyboard flow, filters, decisions and reload |
| 6. Media and handoff | player.ts and connected controls | Verify playback, seek, track switching, CSV and JSON downloads |
| 7. Review fixes | Timing edge cases, detailed CSV evidence, import recovery, content policy | Reproduce and fix reviewer findings, verify the production build in Edge |
| 8. Release verification | Browser workflow, benchmark, CI, deployment, handover | Build and test fresh, verify desktop/mobile, remote deployment and exact remote revision |

Each engineering stage starts with focused tests and ends in a separate GitHub push after verification. Project-local data, build output, and workspace credentials are excluded.
