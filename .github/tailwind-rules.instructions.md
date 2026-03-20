---

---

# Your rule content
- when creating new html elements look for anything in [index.css](mdc:src/index.css) that could be applicable.

- new proposed "base" styles should be added in [index.css](mdc:src/index.css) and should be made to be flexible

- when using tailwind in jsx group similar rule (ie position, child behavior, size, scroll behaver, etc)

- prefer padding over margins where applicable

- try to keep the inline css in the jsx to only pertain to positional and size related rules
 - keep the rest as css classes in index.css, try to make theme reusable and composable
