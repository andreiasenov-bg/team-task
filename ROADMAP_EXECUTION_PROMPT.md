# listO Execution Prompt (Board/Calendar Stabilization)

Objective:
Deliver a stable, production-like local platform where Board and Calendar navigation always works, employee login does not block, and core actions remain usable after role switches.

Rules for this cycle:
1. No visual regressions.
2. No blocking modal/overlay states after login/logout/role changes.
3. Board/Calendar switch must work with mouse, keyboard, and deep-link URL state.
4. Calendar must show deterministic loading, error, empty, and loaded states.
5. Every change must pass build + smoke + critical role-flow e2e.

Execution checklist:
- [x] Capture current issue context and inspect navigation/modal code.
- [x] Implement deterministic Board/Calendar view controller.
- [x] Add URL sync for `view` query param and browser history restore.
- [x] Add calendar loading/error state with Retry action.
- [x] Guard against stale dialog/panel state across auth transitions.
- [x] Verify with `npm run build`, `npm run monitor:smoke`, `npm run monitor:e2e`.
- [ ] Commit and push with clear changelog.
