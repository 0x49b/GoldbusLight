#!/usr/bin/env python3
"""
Keep only black-and-white (low-chroma) gobo thumbnails; remove the rest from disk
and rewrite frontend/public/gobos/catalog.json.

Uses downscaled RGB and HSV-style saturation: (max(R,G,B)-min)/(max) per pixel.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = PROJECT_ROOT / "frontend" / "public" / "gobos" / "catalog.json"
IMAGE_DIR = PROJECT_ROOT / "frontend" / "public" / "gobos" / "images"

# Tuned on Rosco steel catalog: true B/W breakups cluster near 0; color glass/ripple stays high.
MEAN_SAT_MAX = 0.055
P90_SAT_MAX = 0.24


def is_black_white(path: Path) -> bool:
    img = Image.open(path).convert("RGB")
    img = img.resize((64, 64), Image.Resampling.LANCZOS)
    a = np.asarray(img, dtype=np.float32) / 255.0
    mx = np.max(a, axis=2)
    mn = np.min(a, axis=2)
    sat = np.zeros_like(mx, dtype=np.float32)
    np.divide(mx - mn, mx, out=sat, where=mx > 1e-3)
    mean_sat = float(np.mean(sat))
    p90_sat = float(np.percentile(sat, 90))
    return mean_sat < MEAN_SAT_MAX and p90_sat < P90_SAT_MAX


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("catalog.json must be a JSON array")

    kept: list[dict] = []
    removed_codes: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        img_rel = item.get("image")
        if not isinstance(img_rel, str):
            continue
        fname = Path(img_rel).name
        img_path = IMAGE_DIR / fname
        if not img_path.is_file():
            removed_codes.append(str(item.get("code", fname)))
            continue
        try:
            ok = is_black_white(img_path)
        except OSError as exc:
            print(f"skip unreadable {img_path}: {exc}", flush=True)
            removed_codes.append(str(item.get("code", fname)))
            continue
        if ok:
            kept.append(item)
        else:
            removed_codes.append(str(item.get("code", fname)))
            if not dry_run:
                img_path.unlink(missing_ok=True)

    if not dry_run:
        CATALOG_PATH.write_text(json.dumps(kept, indent=2), encoding="utf-8")

    # Remove orphan files not referenced by kept catalog
    keep_names = {Path(i["image"]).name for i in kept if isinstance(i.get("image"), str)}
    orphan = 0
    if not dry_run:
        for p in IMAGE_DIR.iterdir():
            if not p.is_file():
                continue
            if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            if p.name not in keep_names:
                p.unlink(missing_ok=True)
                orphan += 1

    print(
        f"{'[dry-run] ' if dry_run else ''}Kept {len(kept)} / {len(raw)} entries. "
        f"Removed {len(removed_codes)} catalog rows. "
        f"Unlinked orphan files: {orphan}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
