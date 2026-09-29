# Life XP release regression investigation — September 29, 2026

## Report and scope

After deployment of 10.64.2, Joel reported a crash, a notice that cloud sync had failed for two hours, and Stats/Focus screens that looked older than expected. He explicitly permitted inspecting the visible Chrome application. Inspection was limited to visible UI and public build/module metadata; no private cloud payload, browser storage, sync secret, backup or recovery material was used. Production progress was not used as a test fixture or changed manually. No force-sync, restore, reset or source rollback was performed.

The first two browser inspections timed out. After Joel said to try again, the tab responded, its document metadata identified the exact deployed 10.64.2 build, and its Sync panel reported successful encrypted cloud contact without a displayed conflict. No manual Sync now action was taken. This confirms Chrome adoption and an observed cloud contact, not all-device convergence. Opera and phone cannot be inferred from that result.

## Reproduced issues and corrections

1. **Optional delivery script incorrectly blocks startup.** Cloudflare's public delivery injects an analytics script that was absent from the local test server. The asset-failure listener treated every failed script as required application code. In disposable profiles, an intentionally blocked analytics script prevented primary hydration even though every app asset was present. The listener now recognizes the exact first-party runtime bundle by origin, directory and filename. Tests require that allowlist to equal the runtime script references, including the dynamic data guard. They verify optional external/same-name/first-party failures permit startup while missing UI, durable-store and data-guard modules still stop before any profile database opens.

2. **Idle Skills redraw feedback loop.** The UI's broad mutation observer reran its layout sweep, and the sweep assigned the already-correct Skills-toggle text again. The old module produced 86 redundant label mutations in a 700ms synthetic observation. The fix avoids the same-text assignment; the same regression observes zero. Opening/closing labels, expanded semantics, and Stats/Focus rendering remain tested. This proves avoidable work, not the precise cause of the user's transient unresponsive tab.

3. **Current sync failure is hidden.** A rejected pull could leave the old persisted failure in the UI, and manual Sync now always claimed a retry was queued. A synthetic encryption-required refusal reproduced both misleading displays without a cloud write. A local, in-memory attempt receipt now exposes the actual current failure. It is owned by identity/generation and attempt order, ignores benign superseded/control results, and clears after successful full sync rather than metadata-only contact. No sync protection or retry policy is weakened.

## Source/layout provenance

The saved September 27 public HTML is byte-equal to the source baseline after removing exactly one Cloudflare-injected analytics tag (367 bytes). All twelve saved public modules/manifest/service-worker files match the baseline. The final release retained all 46 original static assets and added the shared calendar module. Stats and Focus ledger renderer implementations are identical in the saved public source, baseline and 10.64.2. Synthetic full-app checks loaded the expected UI modules and opened both views without exceptions.

This does not explain the different layout Joel recalls and is not a reason to dismiss the report. No replacement design was invented. A reference or description of that screen remains needed before a specific layout correction can be verified. The prior Cloudflare production version is visible in deployment history; the archived source does not contain a provider-issued receipt binding it to that version identifier.

## Validation and release

New tests are isolated synthetic browser tests; external requests are blocked or mocked. Required-code failure still refuses to open profile databases. Existing multi-device, protocol, calendar, persistence and mobile checks remain in the combined suite. Final test counts and exact source/deployment hashes belong in the release receipt after execution; this document does not predeclare success.

This patch does not establish current phone/Opera versions, live three-device convergence, production backend authorization, physical-device suspension behavior or immutable-vault recovery readiness. User authorization to repair and release app source does not authorize changing those assets or controls.
