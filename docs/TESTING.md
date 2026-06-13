# Testing Strategy

This document describes what to test, where tests live, and the conventions that keep the suite fast and reliable.

## Test Pyramid

| Layer                 | Tool                     | What it covers                                                   | Command                   |
| --------------------- | ------------------------ | ---------------------------------------------------------------- | ------------------------- |
| Unit / component      | Vitest + Testing Library | Pure logic, hooks, stores, components, pages                     | `npm test`                |
| Electron main process | Vitest (node env)        | IPC validation, URL security, OAuth, sanitization, rate limiting | `npm test` (included)     |
| E2E                   | Playwright               | Real Electron app: smoke flows, integration contracts            | `npm run test:e2e`        |
| Accessibility         | Playwright + axe-core    | WCAG 2.1 AA on rendered pages (dark and light themes)            | `npm run test:e2e:a11y`   |
| Visual regression     | Playwright snapshots     | Page-level screenshot diffs                                      | `npm run test:e2e:visual` |

## What to Test (and What Not To)

- **Test behavior, not implementation.** Query the DOM by role/label (`getByRole`, `getByLabelText`), assert on what the user sees, and drive interactions through events — not by reaching into component internals.
- **Every new component, hook, and util gets a colocated test file** (`Foo.tsx` → `Foo.test.tsx`).
- **Pure logic belongs in utils** (`src/features/<name>/utils/`, `src/lib/`) where it can be tested in the node environment without rendering.
- **Don't test third-party libraries** (React Query's caching, framer-motion's animations) — test your integration with them.
- The Electron entry point (`electron/main.ts`) is covered by the Playwright Electron project, not unit tests. Extract any logic worth unit-testing into its own module (see `electron/url-security.ts`, `electron/oauth/utils.ts`).

## Conventions

### Environment directive (required for rendering tests)

jsdom is broken in this repo (webidl-conversions bug). Any test that renders must start with:

```ts
/** @vitest-environment happy-dom */
```

Pure logic tests omit the directive and run in the default node environment.

### Providers and Electron mocks

Use the helpers in `src/test-utils.tsx`:

- `renderWithProviders(ui)` — wraps in QueryClient, MemoryRouter, and ToastProvider.
- `mockElectronAPI()` — installs a `window.electronAPI` mock; extend per-test as needed.

Store tests (Zustand) run in the node environment and set state directly via `useStore.setState(...)`.

### Logging assertions

`src/lib/logger.ts` suppresses console output when `MODE === 'test'` but still records entries to its buffer. Don't spy on `console.*` — assert via the buffer:

```ts
import { getLogBuffer, clearLogBuffer } from '../lib/logger';

clearLogBuffer();
// ...act...
expect(getLogBuffer().filter((e) => e.level === 'error' && e.context === 'Schema')).toHaveLength(1);
```

Raw `console.*` calls are not allowed in `src/` — route everything through the logger (`log.child('Context')` or the predefined `apiLogger`/`authLogger`/etc.).

### Vitest 4 gotchas

- `vi.fn(() => ({...}))` is **not constructible**. Mocks used with `new` (e.g. `AudioContext`, `BrowserWindow`) need `function`/`class` implementations.
- Fake timers: `vi.useFakeTimers()` covers `requestAnimationFrame` only if configured; fake `performance.now` explicitly for animation hooks.

## Coverage

Coverage thresholds are enforced in `vite.config.mts` and fail the build when breached. They are a **regression floor**: bump them up as coverage grows, never down. Run `npm run test:coverage` and open `coverage/index.html` for the per-file report; `coverage/coverage-summary.json` has machine-readable totals.

## E2E

E2E projects are defined in `playwright.config.ts` (electron, integration, accessibility, visual). Integration tests stub the StateSet Engine API with a local mock server — see `e2e/integration.spec.ts`. On headless Linux, run with `xvfb-run -a npm run test:e2e`. Update visual snapshots intentionally with `npm run test:e2e:update-snapshots` and review the diffs in the PR.
