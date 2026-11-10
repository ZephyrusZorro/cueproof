# Cueproof 2.0 · Verify the next revision

A local review loop for teams publishing captions for people who are deaf or hard of hearing, including schools, public agencies, and community media. A meaningful sound cue or speaker label can disappear between files. Keep the editor's request next to the newest evidence so a reviewer can check what actually happened.

[W3C caption review checks](https://www.w3.org/WAI/test-evaluate/easy-checks/captions/) cover sync, speaker identity, and important sounds. [OOONA Review Pro](https://ooona.atlassian.net/wiki/spaces/OHC/pages/341835781) documents playback, QC reporting and shared review. [Subtitle Edit](https://subtitleedit.github.io/subtitleedit/features/main-window.html) supports mature editing and comparison. Cueproof keeps the workflow small and local using the SRT or WebVTT files those editing tools already produce.

## User journey

1. Review a revised track and record changes the editor needs to make.
2. Open **Check next revision**. Select the returned caption file. The just-reviewed track becomes the reference. The previous round is saved separately in the browser for export.
3. Review the **Follow-ups** queue. Each request shows its origin, original note, most recent note if supplied, and the candidate evidence. A request with unchanged or missing evidence still appears. Inspect any cues matched by timing.
4. Mark a request **Verified resolved** or **Still needs changes**. Unresolved requests carry into the next round. Ordinary caption changes and advisory cues remain available independently.
5. Export a timecoded CSV or a portable JSON backup. Existing v1 backups restore as round one. The previous-round backup remains downloadable until the next advancement or workspace replacement.

## Engineering decisions

Keep comparison separate from verification. A candidate comes from the existing order-preserving cue match, or an exact unique wording match near the original time for a missing cue. A heuristic match can suggest evidence. Only the user's decision can verify resolution. Carry linked positions in the new reference plus bounded original evidence for unlinked requests. Request IDs remain stable across rounds. Retain media for a same-video advancement in the current tab.

Store the active and previous snapshots in one compare-and-swap IndexedDB transaction. Ordinary saves retain the archive, while workspace replacement and clearing drop it. Keep v1 decoding, validate v2 request links and notes before replacement, and retain the existing privacy and input bounds. CSV includes request context, observed evidence, and the reviewer's disposition. One earlier round stays in the browser, with explicit backups for longer retention.

## Stages and regression gates

| Stage | Deliverable | Bug review and verification |
| --- | --- | --- |
| 1 | Scope and track-input hardening | Reproduce a valid literal arrow rejected in SRT. Preserve missing cue-separator detection and strict WebVTT payload diagnostics. |
| 2 | Follow-up model and next-round comparison | Reproduce lost requests for unchanged, removed and split cues. Test candidate confidence and manual resolution over multiple rounds. |
| 3 | Durable advancement and compatible handoffs | Test v1 and v2 restores, malformed request links, stable identities, CSV injection, and atomic archive retention on stale writes. |
| 4 | Next-round UI and accessibility review | Exercise upload, failure recovery, unresolved handoff, archive download, focus and small-screen layouts in a real browser. |
| 5 | Release | Independent review, regression fixes, benchmarks, dependency audit, deployment and live workflow checks. |

Publish each verified stage on the v2 development branch. Promote the verified branch to main for the live release.
