#!/usr/bin/env python3
"""ISSUE_410: list i18n keys with no apparent `t(...)` call anywhere in web/
source, for MANUAL review before deletion — this is a candidate finder, not
an auto-delete tool.

Two things a naive "grep for the exact key string" approach gets wrong, both
handled below:

1. Plural forms. i18next resolves `t('foo.bar', { count })` against
   `foo.bar_one`/`foo.bar_other`/etc. — nothing ever calls `t()` with the
   suffixed key literally, so every plural variant is checked against its
   unsuffixed base key instead. The older `_plural` suffix (i18next v3)
   is NOT stripped: this i18next version never resolves it from a bare
   `t()` call, so a `_plural` key is dead weight regardless of whether
   its base key is used elsewhere.

2. Dynamically built keys, e.g. a template literal like auth.errors.${code}
   passed to t() — sometimes inline in the call, sometimes built on an
   earlier line and passed through a variable. Either way the literal
   suffix never appears in source, so any key whose prefix matches such a
   template-literal prefix found ANYWHERE in the scanned files (not just
   inside a t(...) call) is treated as used and excluded from the
   candidate list.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = ["app", "components", "hooks", "lib"]
PLURAL_SUFFIXES = ("_zero", "_one", "_two", "_few", "_many", "_other")
DYNAMIC_PREFIX_RE = re.compile(r"`([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\.\$\{")


def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def base_key(key: str) -> str:
    for suf in PLURAL_SUFFIXES:
        if key.endswith(suf):
            return key[: -len(suf)]
    return key


def iter_source_files():
    for d in SCAN_DIRS:
        yield from (ROOT / d).rglob("*.ts")
        yield from (ROOT / d).rglob("*.tsx")


def find_dynamic_prefixes(files) -> set[str]:
    prefixes = set()
    for path in files:
        text = path.read_text(errors="ignore")
        for m in DYNAMIC_PREFIX_RE.finditer(text):
            prefixes.add(m.group(1) + ".")
    return prefixes


def main():
    en = json.loads((ROOT / "public/locales/en/common.json").read_text())
    fr = json.loads((ROOT / "public/locales/fr/common.json").read_text())
    all_keys = sorted(set(flatten(en)) | set(flatten(fr)))
    base_keys = sorted({base_key(k) for k in all_keys})

    files = list(iter_source_files())
    dynamic_prefixes = find_dynamic_prefixes(files)

    unused = []
    for key in base_keys:
        if any(key.startswith(p) for p in dynamic_prefixes):
            continue
        result = subprocess.run(
            ["grep", "-rlF", f"'{key}'"] + [str(ROOT / d) for d in SCAN_DIRS]
            + ["--include=*.ts", "--include=*.tsx"],
            capture_output=True, text=True,
        )
        result2 = subprocess.run(
            ["grep", "-rlF", f'"{key}"'] + [str(ROOT / d) for d in SCAN_DIRS]
            + ["--include=*.ts", "--include=*.tsx"],
            capture_output=True, text=True,
        )
        if not result.stdout.strip() and not result2.stdout.strip():
            unused.append(key)

    print(f"{len(unused)} / {len(base_keys)} base keys have no literal `t(...)` match "
          f"({len(dynamic_prefixes)} dynamic-prefix namespaces excluded):\n")
    for key in unused:
        print(key)


if __name__ == "__main__":
    main()
