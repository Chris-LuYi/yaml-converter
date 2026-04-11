---
"yaml-converter": minor
---

Add Excel styling and configurable style via `yaml-converter.config.yaml`. Generated workbooks now include coloured group/field header rows, bold white text, auto-filter dropdowns, frozen header rows, and auto-fitted column widths. All style values (font, colours, column widths, row heights) can be overridden per-project using a config file in the working directory. Also removes unnecessary double-quoting of date and semver strings in YAML output — the `yaml` package targets YAML 1.2 where plain scalars are unambiguously strings.
