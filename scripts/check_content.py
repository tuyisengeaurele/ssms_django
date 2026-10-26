"""Checks used by the git hooks.

    python scripts/check_content.py --staged            new lines in the index
    python scripts/check_content.py --all               every tracked text file
    python scripts/check_content.py --commit-msg FILE   a commit message
    python scripts/check_content.py path [path ...]     specific files
"""
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

EM_DASH = "—"
EN_DASH = "–"
MAX_SUBJECT = 72

# Wording we keep out of the product, the docs and the commit history.
BANNED = [
    (r"\bas an ai\b", "sounds like a chatbot"),
    (r"\blanguage model\b", "sounds like a chatbot"),
    (r"\bclaude\b", "tool name"),
    (r"\banthropic\b", "tool name"),
    (r"\bchatgpt\b", "tool name"),
    (r"\bopenai\b", "tool name"),
    (r"\bcopilot\b", "tool name"),
    (r"co-authored-by", "commit trailer"),
    (r"generated with", "tool footer"),
    (r"\bseamless(ly)?\b", "marketing filler"),
    (r"\bleverag(e|es|ed|ing)\b", "marketing filler"),
    (r"\bempower(s|ed|ing|ment)?\b", "marketing filler"),
    (r"\brevolutioni[sz](e|es|ed|ing)\b", "marketing filler"),
    (r"\bcutting-edge\b", "marketing filler"),
    (r"\bgame-changer\b", "marketing filler"),
    (r"\bdelve\b", "marketing filler"),
    (r"\bunlock the power\b", "marketing filler"),
    (r"\bsupercharge[sd]?\b", "marketing filler"),
    (r"\bharness the power\b", "marketing filler"),
    (r"\bin today's fast-paced\b", "marketing filler"),
    (r"\btapestry\b", "marketing filler"),
    (r"\breimagined\b", "marketing filler"),
    (r"\bnext-generation\b", "marketing filler"),
]
BANNED_RES = [(re.compile(p, re.IGNORECASE), why) for p, why in BANNED]

EXCLUDED_GLOBS = [
    "node_modules/*", "*/node_modules/*", "venv/*", ".git/*", "dist/*", "*/dist/*",
    "staticfiles/*", "media/*", "backups/*", "*/migrations/*",
    "docs/superpowers/*", "design/*",
    "scripts/check_content.py", "scripts/tests/*",
    "*package-lock.json", "*.lock", "*.keras", "*.dump",
    "*.png", "*.jpg", "*.jpeg", "*.webp", "*.avif", "*.gif", "*.ico",
    "*.mp4", "*.woff", "*.woff2", "*.pdf",
]


def is_excluded(path: str) -> bool:
    path = path.replace("\\", "/")
    return any(fnmatch.fnmatch(path, g) for g in EXCLUDED_GLOBS)


def check_line(line: str) -> list[str]:
    problems = []
    if EM_DASH in line:
        problems.append("em dash, use a comma, colon or full stop")
    if EN_DASH in line:
        problems.append("en dash, use 'to' or a plain hyphen")
    for pattern, why in BANNED_RES:
        if pattern.search(line):
            problems.append(f"'{pattern.search(line).group(0)}' ({why})")
    return problems


def check_commit_message(message: str) -> list[str]:
    lines = [ln for ln in message.splitlines() if not ln.startswith("#")]
    subject = next((ln for ln in lines if ln.strip()), "")
    if not subject:
        return ["empty commit message"]
    problems = []
    skips_length = subject.startswith(("Merge ", "Revert ", "fixup!", "squash!"))
    if len(subject) > MAX_SUBJECT and not skips_length:
        problems.append(f"subject is {len(subject)} characters, keep it under {MAX_SUBJECT}")
    for ln in lines:
        problems.extend(check_line(ln))
    return problems


def added_lines_from_diff(diff: str) -> list[tuple[str, int, str]]:
    rows = []
    path = None
    lineno = 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            target = raw[4:]
            path = None if target == "/dev/null" else target.removeprefix("b/")
        elif raw.startswith("@@"):
            match = re.search(r"\+(\d+)", raw)
            lineno = int(match.group(1)) - 1 if match else 0
        elif raw.startswith("+") and not raw.startswith("+++"):
            lineno += 1
            if path and not is_excluded(path):
                rows.append((path, lineno, raw[1:]))
        elif raw.startswith(" "):
            lineno += 1
    return rows


def _report(rows: list[tuple[str, int, str]]) -> int:
    bad = 0
    for path, lineno, text in rows:
        for problem in check_line(text):
            print(f"{path}:{lineno}: {problem}")
            bad += 1
    return bad


def _read(path: str) -> list[tuple[str, int, str]]:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (UnicodeDecodeError, FileNotFoundError):
        return []
    return [(path, i, ln) for i, ln in enumerate(text.splitlines(), start=1)]


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "--commit-msg":
        problems = check_commit_message(Path(argv[1]).read_text(encoding="utf-8"))
        for problem in problems:
            print(f"commit message: {problem}")
        return 1 if problems else 0
    if argv == ["--staged"]:
        diff = _git("diff", "--cached", "-U0", "--no-color", "--diff-filter=ACM")
        bad = _report(added_lines_from_diff(diff))
    elif argv == ["--all"]:
        rows = []
        for path in _git("ls-files").splitlines():
            if not is_excluded(path):
                rows.extend(_read(path))
        bad = _report(rows)
        print(f"{bad} problem(s) found")
    elif argv:
        bad = _report([row for p in argv if not is_excluded(p) for row in _read(p)])
    else:
        print(__doc__)
        return 2
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
