"""File parsers: text-extract from many formats with safe fallbacks."""
from __future__ import annotations

import os
from typing import Iterable, Optional, Tuple

import chardet


BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico",
    ".pdf",  # handled separately
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".jar", ".war", ".class", ".so", ".dll", ".exe", ".bin",
    ".mp3", ".mp4", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".otf",
}

CODE_EXT = {
    ".java", ".kt", ".scala", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx",
    ".go", ".rs", ".rb", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".html", ".css", ".scss", ".json", ".yml", ".yaml", ".xml", ".sql",
    ".md", ".txt", ".sh", ".env", ".properties", ".gradle",
}

ALWAYS_INCLUDE_NAMES = {
    "readme", "readme.md", "pom.xml", "package.json", "build.gradle",
    "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "application.properties", "application.yml", "application.yaml",
}


def is_probably_text(filename: str) -> bool:
    name = os.path.basename(filename).lower()
    if name in ALWAYS_INCLUDE_NAMES:
        return True
    ext = os.path.splitext(filename)[1].lower()
    if ext in BINARY_EXT:
        return False
    if ext in CODE_EXT:
        return True
    return False  # default: skip unknown


def read_text(path: str) -> Optional[str]:
    try:
        with open(path, "rb") as f:
            raw = f.read()
        if not raw:
            return ""
        enc = chardet.detect(raw[:4096]).get("encoding") or "utf-8"
        try:
            return raw.decode(enc, errors="replace")
        except Exception:
            return raw.decode("utf-8", errors="replace")
    except Exception:
        return None


def extract_pdf(path: str) -> str:
    import fitz  # pymupdf
    out: list[str] = []
    with fitz.open(path) as doc:
        for page in doc:
            out.append(page.get_text("text"))
    return "\n\n".join(out)


def extract_docx(path: str) -> str:
    import docx
    d = docx.Document(path)
    return "\n".join(p.text for p in d.paragraphs)


def extract_any(path: str) -> Tuple[str, str]:
    """Returns (text, kind). kind in {text, pdf, docx, skipped}."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return extract_pdf(path), "pdf"
    if ext == ".docx":
        return extract_docx(path), "docx"
    if is_probably_text(path):
        t = read_text(path)
        return (t or ""), "text"
    return "", "skipped"


def walk_repo(root: str, max_files: int, max_bytes: int) -> Iterable[str]:
    """Yield file paths inside a repo, skipping vendored / build / VCS dirs."""
    skip_dirs = {".git", "node_modules", "target", "build", "dist", "out",
                 ".idea", ".vscode", ".gradle", ".mvn", "venv", ".venv",
                 "__pycache__", "coverage"}
    count = 0
    total = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for name in filenames:
            full = os.path.join(dirpath, name)
            try:
                sz = os.path.getsize(full)
            except OSError:
                continue
            if sz > 1_500_000:  # skip files >1.5MB
                continue
            if not (is_probably_text(name) or name.lower().endswith((".pdf", ".docx"))):
                continue
            total += sz
            count += 1
            if count > max_files or total > max_bytes:
                return
            yield full
