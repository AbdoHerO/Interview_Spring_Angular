"""Code-aware semantic chunker.

Strategy:
 - For code files: split on top-level structural boundaries (class, function,
   method, @Component / @Service / @RestController, etc.) and then pack into
   token-bounded windows with overlap. Preserves syntactic context.
 - For prose/markdown: split on headings, then by paragraph, then by sentence
   to hit the target token budget.

Each chunk carries metadata: filename, language, technology, file_type, section.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from app.utils.tokens import count_tokens


# ------------- language / technology detection -------------

EXT_LANG = {
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cs": "csharp",
    ".html": "html", ".css": "css", ".scss": "scss",
    ".json": "json", ".yml": "yaml", ".yaml": "yaml",
    ".xml": "xml", ".sql": "sql", ".sh": "bash",
    ".md": "markdown", ".txt": "text",
}

TECH_HINTS = [
    ("spring-boot", re.compile(r"@(RestController|Service|Repository|SpringBootApplication|Configuration|Component)\b")),
    ("spring-data-jpa", re.compile(r"@(Entity|Table|OneToMany|ManyToOne|Query)\b|JpaRepository")),
    ("spring-security", re.compile(r"SecurityFilterChain|@PreAuthorize|UserDetailsService|JwtAuthenticationFilter")),
    ("jwt", re.compile(r"\bJwt\w*|io\.jsonwebtoken")),
    ("hibernate", re.compile(r"org\.hibernate|hibernate\.cfg")),
    ("kafka", re.compile(r"@KafkaListener|KafkaTemplate|spring-kafka")),
    ("docker", re.compile(r"^FROM\s+\S+|docker-compose|version:\s*['\"]?3", re.MULTILINE)),
    ("angular", re.compile(r"@Component\(\{|@NgModule|@Injectable\(|RouterModule")),
    ("react", re.compile(r"\bReact\b|useState\(|useEffect\(")),
    ("microservice", re.compile(r"@EnableEurekaClient|@EnableDiscoveryClient|@FeignClient|spring-cloud")),
]


def detect_language(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return EXT_LANG.get(ext, "text")


def detect_technologies(filename: str, content: str) -> List[str]:
    techs: List[str] = []
    head = content[:8000]
    for name, rx in TECH_HINTS:
        if rx.search(head):
            techs.append(name)
    base = os.path.basename(filename).lower()
    if base == "pom.xml":            techs.append("maven")
    if base == "build.gradle":       techs.append("gradle")
    if base == "package.json":       techs.append("node")
    if base == "dockerfile":         techs.append("docker")
    if base.startswith("application") and base.endswith((".yml", ".yaml", ".properties")):
        techs.append("spring-boot")
    return sorted(set(techs))


# ------------- chunking -------------

@dataclass
class Chunk:
    text: str
    tokens: int
    metadata: Dict[str, str] = field(default_factory=dict)


# Top-level structural splits — language-aware regex points to split *before*.
CODE_SPLITTERS: Dict[str, List[re.Pattern]] = {
    "java": [
        re.compile(r"^\s*(public|private|protected)?\s*(static\s+)?(final\s+)?(class|interface|enum|record)\s+\w+", re.MULTILINE),
        re.compile(r"^\s*@\w+(\([^)]*\))?\s*$", re.MULTILINE),
        re.compile(r"^\s*(public|private|protected)\s+[\w<>\[\],\s?]+\s+\w+\s*\(", re.MULTILINE),
    ],
    "typescript": [
        re.compile(r"^\s*export\s+(default\s+)?(class|function|const|interface|type|enum)\s+\w+", re.MULTILINE),
        re.compile(r"^\s*@\w+\(", re.MULTILINE),
    ],
    "javascript": [
        re.compile(r"^\s*(export\s+)?(async\s+)?function\s+\w+", re.MULTILINE),
        re.compile(r"^\s*class\s+\w+", re.MULTILINE),
    ],
    "python": [
        re.compile(r"^\s*(class|def)\s+\w+", re.MULTILINE),
    ],
}


def _split_by_regex(text: str, patterns: List[re.Pattern]) -> List[str]:
    points = {0, len(text)}
    for p in patterns:
        for m in p.finditer(text):
            points.add(m.start())
    sorted_pts = sorted(points)
    blocks: List[str] = []
    for a, b in zip(sorted_pts, sorted_pts[1:]):
        seg = text[a:b]
        if seg.strip():
            blocks.append(seg)
    return blocks or [text]


def _split_markdown(text: str) -> List[str]:
    # split before each heading
    pts = [0]
    for m in re.finditer(r"^#{1,6}\s+", text, flags=re.MULTILINE):
        pts.append(m.start())
    pts.append(len(text))
    pts = sorted(set(pts))
    out: List[str] = []
    for a, b in zip(pts, pts[1:]):
        seg = text[a:b]
        if seg.strip():
            out.append(seg)
    return out or [text]


def _pack(blocks: Iterable[str], target_tokens: int, overlap_tokens: int,
          base_meta: Dict[str, str]) -> List[Chunk]:
    chunks: List[Chunk] = []
    buf: List[str] = []
    buf_tokens = 0
    for b in blocks:
        bt = count_tokens(b)
        if bt > target_tokens * 1.5 and len(b) > 200:
            # over-large block -> hard-split by lines
            lines = b.splitlines(keepends=True)
            sub: List[str] = []
            sub_tokens = 0
            for ln in lines:
                lt = count_tokens(ln)
                if sub_tokens + lt > target_tokens and sub:
                    chunks.append(_finalize(sub, sub_tokens, base_meta))
                    # overlap by tail
                    sub, sub_tokens = _tail_overlap(sub, overlap_tokens)
                sub.append(ln); sub_tokens += lt
            if sub:
                chunks.append(_finalize(sub, sub_tokens, base_meta))
            continue

        if buf_tokens + bt > target_tokens and buf:
            chunks.append(_finalize(buf, buf_tokens, base_meta))
            buf, buf_tokens = _tail_overlap(buf, overlap_tokens)
        buf.append(b); buf_tokens += bt
    if buf:
        chunks.append(_finalize(buf, buf_tokens, base_meta))
    return chunks


def _tail_overlap(buf: List[str], overlap: int) -> tuple[List[str], int]:
    if overlap <= 0 or not buf:
        return [], 0
    text = "".join(buf)
    if count_tokens(text) <= overlap:
        return list(buf), count_tokens(text)
    # take last N tokens approx by char ratio
    snippet = text[-overlap * 4 :]
    return [snippet], count_tokens(snippet)


def _finalize(parts: List[str], toks: int, base_meta: Dict[str, str]) -> Chunk:
    text = "".join(parts).strip()
    # capture a "section" hint from first non-blank line / heading
    section = ""
    for line in text.splitlines():
        s = line.strip()
        if s:
            section = s[:120]
            break
    meta = dict(base_meta)
    meta["section"] = section
    return Chunk(text=text, tokens=toks, metadata=meta)


def chunk_file(*, filename: str, content: str, source_id: str,
               target_tokens: int = 400, overlap_tokens: int = 60,
               extra_meta: Optional[Dict[str, str]] = None) -> List[Chunk]:
    lang = detect_language(filename)
    techs = detect_technologies(filename, content)
    base_meta: Dict[str, str] = {
        "source_id": source_id,
        "filename": filename,
        "language": lang,
        "file_type": "code" if lang not in {"markdown", "text"} else "doc",
        "technology": techs[0] if techs else "",
        "technologies_all": ",".join(techs),
    }
    if extra_meta:
        base_meta.update({k: str(v) for k, v in extra_meta.items()})

    if lang == "markdown":
        blocks = _split_markdown(content)
    elif lang in CODE_SPLITTERS:
        blocks = _split_by_regex(content, CODE_SPLITTERS[lang])
    else:
        # generic: split by blank lines
        blocks = [p for p in re.split(r"\n\s*\n", content) if p.strip()] or [content]

    return _pack(blocks, target_tokens, overlap_tokens, base_meta)
