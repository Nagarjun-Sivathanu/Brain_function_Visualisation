"""Windows ↔ WSL path normalisation.

The user can write env vars in either format:
    OBSERVER_DB_PATH=C:\\Users\\nagu\\foo.db        (Windows convention)
    OBSERVER_DB_PATH=/mnt/c/Users/nagu/foo.db       (WSL convention)

Everything inside AAS expects the WSL form (since we run inside WSL Ubuntu
and open files via the kernel's /mnt mount). `to_wsl_path` is the single
chokepoint that normalises whichever form the user wrote.

There are no external dependencies — this is pure string work — so it can
be unit-tested without spinning up the app.
"""

from __future__ import annotations

import re

_WIN_DRIVE_RE = re.compile(r"^([A-Za-z]):[\\/](.*)$")


def to_wsl_path(p: str | None) -> str | None:
    """Normalise a path to WSL form.

    - ``None`` / empty → ``None`` (so callers can use the result as a truthy check).
    - Already a /mnt/... or other POSIX path → returned unchanged.
    - ``C:\\Users\\nagu\\x.db`` or ``c:/users/nagu/x.db`` → ``/mnt/c/Users/nagu/x.db``.
    - Backslashes are converted to forward slashes after the drive letter.
    - Drive letters are lower-cased to match the convention used by the WSL
      9P mount (`/mnt/c/...`, not `/mnt/C/...`).
    """
    if not p:
        return None
    s = p.strip()
    if not s:
        return None

    # Already-WSL path: leave alone.
    if s.startswith("/"):
        return s

    m = _WIN_DRIVE_RE.match(s)
    if not m:
        # Not a recognised Windows path either — return as-is and let the
        # downstream open() complain with a real error. (e.g. a bare filename
        # used during testing.)
        return s

    drive = m.group(1).lower()
    rest = m.group(2).replace("\\", "/")
    return f"/mnt/{drive}/{rest}"


# ── Tiny self-test, runnable with `python -m app.path_bridge` ───────────────

if __name__ == "__main__":
    cases = [
        (None, None),
        ("", None),
        ("   ", None),
        (r"C:\Users\nagu\x.db", "/mnt/c/Users/nagu/x.db"),
        (r"c:\users\nagu\x.db", "/mnt/c/users/nagu/x.db"),
        ("C:/Users/nagu/x.db", "/mnt/c/Users/nagu/x.db"),
        ("/mnt/c/Users/nagu/x.db", "/mnt/c/Users/nagu/x.db"),
        ("D:\\Projects\\foo.db", "/mnt/d/Projects/foo.db"),
        ("/tmp/local.db", "/tmp/local.db"),
        ("relative/file.db", "relative/file.db"),
    ]
    for inp, expected in cases:
        got = to_wsl_path(inp)
        status = "✓" if got == expected else "✗"
        print(f"  {status}  {inp!r:50} → {got!r}")
        assert got == expected, f"expected {expected!r}, got {got!r}"
    print("\nall path_bridge cases pass")
