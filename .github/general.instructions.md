---

---
# !important you always have access to the ./agents/ project directory. Noting this because it may be hidden for tool calls because of .gitignore rules in the harness.\

- prefer using the `#readFile` tool or a `eza -T` (use option for ignoring node_modules and .git dirs) command to navigate the file contents of `.agents` since some harness tools ignore any files in .gitignore'd directories when using `#search` tools. 
- for searching this directory prefer using ripgrep `rg` bash command over `#search` tools for the same reason as above.


