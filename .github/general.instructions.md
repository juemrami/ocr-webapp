---

---
# !important you always have access to the ./agents/ project directory. Noting this because it may be hidden for tool calls because of .gitignore rules in the harness.\
- !important, this file dir is usually ignored and one must use the `includeIgnoredFiles` option or similar in your harness search tools to access it.\
- prefer using the `#readFile` tool or a `eza -T` (use option for ignoring node_modules and .git dirs) command to navigate the file contents of `.agents` since some harness tools ignore any files in .gitignore'd directories when using `#search` tools.
- for searching this directory prefer using ripgrep `rg` bash command over `#search` tools for the same reason as above.


## Search Instructions

- **Goal:** locate docs + implementation for module `X` inside repository `Y` under repos.
- **Steps:**
  - List agent repos: `ls -la .agents/repos`
  - Broad search for `X` across repos: `rg --hidden -n "X" .agents/repos`
  - Narrow search to repo `Y` for common patterns:
    - `rg -n "import\s+\{[^}]*X[^}]*\}|\bX\b" .agents/repos/Y --hidden`
    - `rg -n "module\s+X|export\s+.*X" .agents/repos/Y --hidden`
  - Inspect likely locations in `Y`:
    - docs: `Y/**/README*`, SCHEMA.md, `Y/**/*.md`
    - package entrypoints: `Y/packages/*/package.json`
    - source: `Y/**/src/**/*X*.{ts,js,mts,cts}`
    - migration/notes: `Y/migration/**/*{X,upgrade}*.md`
- **Decision rules:**
  - If markdown doc named like the module exists under `packages/*` prefer it for overview.
  - Prefer `packages/*/src` implementations for source-level details.
  - If mapping versions, inspect `migration/` or `MIGRATION.md`.
- **Example generic shell commands (variables: X, Y):**
```bash
ls -la .agents/repos
rg --hidden -n "X" .agents/repos
rg --hidden -n "import\\s+\\{[^}]*X[^}]*\\}|\\bX\\b" .agents/repos/Y
ls -la .agents/repos/Y/packages
rg -n "export .*X|default .*X" .agents/repos/Y/packages -S
```
