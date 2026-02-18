# Contributing to StateSet Desktop

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22.12+ (see `.nvmrc`)
- npm 10+
- A display server (for Electron — Xvfb works on headless Linux)

### Getting Started

```bash
git clone https://github.com/stateset/stateset-desktop.git
cd stateset-desktop
npm install
cp .env.example .env
npm run dev
```

See `.env.example` for all available configuration options.

## Making Changes

### Workflow

1. Fork the repository
2. Create a feature branch from `master` (`git checkout -b feature/my-change`)
3. Make your changes
4. Run the checks (see below)
5. Commit with a descriptive message
6. Push to your fork and open a Pull Request

### Running Checks

Before submitting a PR, make sure everything passes:

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Unit tests
npm run test

# E2E tests (requires display)
npm run test:e2e
```

All of these run automatically in CI on every PR.

### Code Style

- **ESLint** and **Prettier** are enforced via pre-commit hooks (Husky + lint-staged)
- TypeScript strict mode is enabled
- Use existing patterns in the codebase as a guide

### Commit Messages

Write clear, concise commit messages:

- Use the imperative mood ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issue numbers where applicable (`Fix #123`)

### Project Structure

```
src/
├── components/     # Shared UI components
├── config/         # App configuration
├── features/       # Feature modules
├── hooks/          # Shared React hooks
├── lib/            # Core utilities (API client, schemas)
├── pages/          # Page components
├── stores/         # Zustand stores
└── types/          # TypeScript types
```

### Key Conventions

- **API calls** go through `apiRequest()` in `src/lib/api.ts`
- **State management** uses Zustand stores in `src/stores/`
- **Feature code** lives in `src/features/<name>/` with its own components, hooks, and utils
- **Tests** use Vitest + Testing Library with the `happy-dom` environment
- **Styling** uses Tailwind CSS

## Reporting Bugs

Open an issue using the [bug report template](https://github.com/stateset/stateset-desktop/issues/new?template=bug_report.md). Include:

- Steps to reproduce
- Expected vs actual behavior
- OS and app version
- Screenshots if applicable

## Requesting Features

Open an issue using the [feature request template](https://github.com/stateset/stateset-desktop/issues/new?template=feature_request.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
