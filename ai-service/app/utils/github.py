"""Repository download (Git clone) with safety limits."""
from __future__ import annotations

import os
import shutil
import tempfile
from typing import Optional

from git import Repo


class RepoError(RuntimeError):
    pass


def clone_repo(url: str, branch: Optional[str] = None) -> str:
    """Shallow-clone a public git repo to a temp dir. Returns the local path.

    Caller is responsible for cleanup via `cleanup_repo`.
    """
    if not (url.startswith("https://") or url.startswith("http://")):
        raise RepoError("only http(s) git URLs are accepted")
    tmp = tempfile.mkdtemp(prefix="repo_")
    try:
        kwargs = {"depth": 1, "single_branch": True}
        if branch:
            kwargs["branch"] = branch
        Repo.clone_from(url, tmp, **kwargs)
        return tmp
    except Exception as e:
        shutil.rmtree(tmp, ignore_errors=True)
        raise RepoError(f"git clone failed: {e}") from e


def cleanup_repo(path: str) -> None:
    if path and os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
