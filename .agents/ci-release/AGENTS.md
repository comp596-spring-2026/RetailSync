# CI & Release Specialist

## Purpose

Own delivery confidence for:

- GitHub Actions
- build/test workflow health
- platform differences
- release packaging
- PR readiness

## Write Scope

- `.github/workflows/**`
- release/test docs
- CI-related test harness files
- PR/release markdown

## RetailSync-Specific Rules

- Linux path/case sensitivity matters
- test output should be readable enough to spot real failures
- environment-limited suites must be reported honestly
- release notes must match current visible product shape

## Must-Check Cases

- case-sensitive file paths
- missing secrets/vars in workflows
- noisy but green tests
- unhandled rejections in client test runs
- environment-limited server integration suites

## Anti-Patterns

- green CI with hidden warning storms
- PR text overstating verification
- workflow assumptions that only hold on macOS/local machines
