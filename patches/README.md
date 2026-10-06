# Security patches

## braces 3.0.3 — GHSA-vfj7-8cjw-p6xm

There is no published patched release as of 2026-10-06. The pnpm patch caps
parser nesting at 128 stack entries and recursive compile/expand/stringify
walkers at depth 128, including callers supplying an AST directly. Excessive
nesting raises a controlled SyntaxError before the JavaScript stack overflows.
The guard is fixed and cannot be disabled through package options.

This is a local mitigation, not an upstream release. Dependabot cannot infer
the patch from the version number. Remove the patch and update the dependency
once an upstream security release is available.

Run `pnpm security:deps` to verify hostile inputs are rejected and normal brace
expansion/glob matching remain supported. API security tests are available with
`pnpm --filter @workspace/api-server security:qa`.
