"""User-configurable settings, loaded from JSON.

Anything a BIM manager might reasonably want to change without touching Python
lives in ``bepkit/config_files/defaults.json``. A site override is deep-merged
over it, resolved in this order:

1. ``$BEP_CONFIG`` — an explicit path (file or directory of ``*.json``)
2. ``./bep.config.json`` in the working directory
3. ``<data dir>/config.json`` — the deployed instance's own settings
4. runtime overrides — ``bep --set key=value``, applied last
"""

from __future__ import annotations

import copy
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

DEFAULTS_PATH = Path(__file__).resolve().parent / "config_files" / "defaults.json"

# Overrides supplied for this process only, e.g. by ``bep --set``, keyed by
# dotted path. Applied last, and they replace the value at that path rather
# than merging into it, so ``--set ids.sources.iso19650.classification={}``
# really empties it.
_runtime: dict[str, Any] = {}


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Overlay wins for scalars and lists; dictionaries merge key by key."""
    result = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _read(path: Path) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as exc:
        # A broken override must never take the app down; it is reported and skipped.
        print(f"bep: ignoring settings file {path}: {exc}")
        return {}


def override_paths() -> list[Path]:
    paths: list[Path] = []
    configured = os.environ.get("BEP_CONFIG")
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_dir():
            paths.extend(sorted(candidate.glob("*.json")))
        elif candidate.is_file():
            paths.append(candidate)
    local = Path.cwd() / "bep.config.json"
    if local.is_file():
        paths.append(local)
    try:
        from .config import _data_dir

        instance = _data_dir() / "config.json"
        if instance.is_file():
            paths.append(instance)
    except Exception:  # pragma: no cover - data dir not writable
        pass
    return paths


@lru_cache(maxsize=1)
def settings() -> dict[str, Any]:
    merged = _read(DEFAULTS_PATH)
    for path in override_paths():
        merged = _deep_merge(merged, _read(path))
    for path, value in _runtime.items():
        _assign(merged, path, copy.deepcopy(value))
    return merged


def _assign(tree: dict[str, Any], path: str, value: Any) -> None:
    node = tree
    parts = path.split(".")
    for part in parts[:-1]:
        child = node.get(part)
        child = dict(child) if isinstance(child, dict) else {}
        node[part] = child
        node = child
    node[parts[-1]] = value


def get(path: str, default: Any = None) -> Any:
    """Read a dotted settings path, e.g. ``get("ai.model")``."""
    node: Any = settings()
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return copy.deepcopy(node) if isinstance(node, (dict, list)) else node


def reload() -> None:
    settings.cache_clear()


def parse_assignment(text: str) -> tuple[str, Any]:
    """``"ids.data_type=IFCTEXT"`` -> ``("ids.data_type", "IFCTEXT")``.

    The value is read as JSON when it parses (numbers, booleans, lists, objects)
    and as a plain string otherwise, so ``ids.min_occurs=1`` is an int and
    ``ai.model=qwen3:8b`` stays a string.
    """
    if "=" not in text:
        raise ValueError(f"'{text}' is not a key=value assignment")
    key, raw = text.split("=", 1)
    key = key.strip()
    if not key:
        raise ValueError(f"'{text}' has no key")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        value = raw
    return key, value


def override(path: str, value: Any) -> None:
    """Replace the value at a dotted settings path for the rest of this process."""
    _runtime[path] = value
    reload()


def clear_overrides() -> None:
    _runtime.clear()
    reload()
