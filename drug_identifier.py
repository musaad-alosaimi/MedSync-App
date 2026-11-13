#!/usr/bin/env python3
"""
drug_identifier.py - Identify pharmaceutical products (pills, capsules, blister
packs, boxes) in a photo and predict brand / generic names.

Pipeline
--------
 1. preprocess   : load image, denoise, contrast-enhance
 2. segment      : Canny edges (9x9 blur, percentile thresholds) -> dilate -> filled
                   external contours -> small open/close -> packaging-geometry filter
                   (rectangularity >= 0.55, aspect <= 4) -> split touching boxes
                   (border-median colour model only as a fallback) -> one crop per item
 3. describe     : cheap visual attributes per item (shape, dominant colour)
 4. recognise    : OCR (EasyOCR -> Tesseract fallback)   [Option A]
                   CNN embeddings vs. reference images    [Option B, optional]
 5. match        : fuzzy-match OCR text + attributes (+ embeddings) against a
                   reference DataFrame, return top-k candidates with scores
 6. report       : console table, pandas DataFrame, JSON, annotated image

Usage
-----
    python drug_identifier.py make-mock --out mock          # DB + test image
    python drug_identifier.py identify mock/test_image.png --db mock/mock_db.csv
    python drug_identifier.py identify photo.jpg --db my_db.csv --engine tesseract \
           --top-k 3 --out results --embeddings --ref-dir reference_images

DISCLAIMER: educational prototype. NEVER use it to make real medication
decisions - always verify a medicine with a pharmacist / the official label.
"""
from __future__ import annotations

import argparse
import difflib
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import pandas as pd

log = logging.getLogger("drug_identifier")

# rapidfuzz is faster/better, but difflib (stdlib) works as a fallback.
try:
    from rapidfuzz import fuzz as _fuzz

    def _ratio(a: str, b: str) -> float:
        return _fuzz.ratio(a, b) / 100.0

    def _partial(a: str, b: str) -> float:
        return _fuzz.partial_ratio(a, b) / 100.0

except ImportError:  # pragma: no cover
    def _ratio(a: str, b: str) -> float:
        return difflib.SequenceMatcher(None, a, b).ratio()

    def _partial(a: str, b: str) -> float:
        """Best ratio of the shorter string against any equal-length window."""
        short, long_ = (a, b) if len(a) <= len(b) else (b, a)
        if not short:
            return 0.0
        n = len(short)
        return max(_ratio(short, long_[i:i + n]) for i in range(len(long_) - n + 1))


# ============================================================================
# Configuration
# ============================================================================
@dataclass
class Config:
    min_area_frac: float = 0.004     # ignore blobs smaller than 0.4 % of image
    max_area_frac: float = 0.90      # ignore blobs covering > 90 % of image
    bg_threshold: float = 22.0       # FALLBACK only: Lab distance from the border colour
    # --- edge-based segmentation -------------------------------------------------
    blur_k: int = 9                  # Gaussian blur before Canny (kills wood/fabric texture)
    canny_pct: float = 95.0          # Canny hi = this percentile of the blurred gradient ...
    canny_hi_min: float = 60.0       # ... clipped to [60, 160];  lo = canny_lo_ratio * hi
    canny_hi_max: float = 160.0
    chroma_hi_min: float = 40.0      # same for the Lab a/b (colour) edge map
    canny_lo_ratio: float = 0.5
    edge_dilate: int = 7             # edge dilation (closes outline gaps) - undone by an erosion
    edge_pad: int = 20               # border padding so packs touching the frame still close
    open_k: int = 1                  # optional opening kernel (<=1 = off; the edge dilate/erode already drops hairs)
    close_extra: int = 2             # closing kernel = k + 2 (k ~ 9 px at 1600x1200)
    # --- packaging geometry ------------------------------------------------------
    min_rectangularity: float = 0.55 # area / rotated-bbox area  (boxes ~0.9, ovals ~0.79)
    max_aspect: float = 4.0          # reject slivers (long / short side)
    clean_rectangularity: float = 0.85  # above this a blob is one clean box -> never split
    split_margin: float = 0.03       # a cut must beat the un-cut blob by this much
    absorb_close_frac: float = 0.035 # gap-bridging kernel (fraction of short side) for faint-edge packs
    ocr_angle_step: int = 20         # OCR rotation step for oval / capsule / round items
    max_side: int = 1600             # downscale huge photos for speed
    crop_pad: int = 6                # px padding around each detected item
    ocr_min_side: int = 700          # upscale small crops before OCR
    ocr_min_conf: float = 0.25       # drop OCR tokens below this confidence
    ocr_pool_conf: float = 0.80      # confident words from any pass are pooled into the evidence
    ocr_good_q: float = 30.0         # stop trying extra image variants once a reading scores this well
    top_k: int = 3
    confident_score: float = 0.70    # >= and clear margin -> "confident"
    margin: float = 0.10             # min gap between #1 and #2 for "confident"
    low_score: float = 0.45          # >= -> "low_confidence", below -> "unknown"
    # fusion weights (re-normalised over the components that are available)
    w_text: float = 0.55
    w_emb: float = 0.25
    w_attr: float = 0.20


# ============================================================================
# 1. Loading & preprocessing
# ============================================================================
def load_image(path: str | Path, max_side: int = 1600) -> np.ndarray:
    """Load a BGR image with OpenCV and downscale very large photos."""
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {path}")
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def enhance_contrast(bgr: np.ndarray) -> np.ndarray:
    """Denoise + CLAHE on the L channel (keeps colours natural).
    NOT used for segmentation any more (it amplifies wood / fabric texture); kept as a helper."""
    den = cv2.bilateralFilter(bgr, d=7, sigmaColor=40, sigmaSpace=40)
    lab = cv2.cvtColor(den, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


# ============================================================================
# 2. Segmentation   Canny edges -> solid masks -> packaging-geometry filter
#                   (+ splitting of touching packages)
# ============================================================================
@dataclass
class Item:
    """One detected object in the photo."""
    item_id: int
    bbox: tuple[int, int, int, int]          # x, y, w, h in the (resized) image
    crop: np.ndarray                         # BGR crop (axis-aligned)
    mask: np.ndarray                         # uint8 mask of the crop (255 = object)
    contour: np.ndarray
    upright: Optional[np.ndarray] = None     # crop de-skewed along the min-area rectangle
    shape: str = "unknown"
    color: str = "unknown"
    ocr_tokens: list = field(default_factory=list)   # [(text, conf), ...]
    ocr_text: str = ""


def _ellipse(k: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(k), int(k)))


def _background_mask(bgr: np.ndarray, cfg: Config) -> np.ndarray:
    """
    EDGE-BASED foreground mask (replaces the old border-median colour model).

      1. grey + strong Gaussian blur (9x9): wood grain / fabric weave / carpet pile
         have a *low* gradient after blurring, printed box borders keep a high one
      2. Canny with thresholds taken from the image itself:
             hi = 95th percentile of the blurred gradient magnitude, clipped to [60, 160]
             lo = 0.5 * hi
         so a smooth surface automatically gets a low threshold and a busy one a high one
      3. dilate the edges (7x7) so small breaks in a package outline close up
      4. external contours of the edge map, FILLED -> solid blobs
      5. erode by the same 7x7 to undo the growth of step 3

    The image is padded with the border-median grey first, so a package touching
    the photo frame still gets a closed outline.
    """
    p = cfg.edge_pad
    border = np.concatenate([bgr[0], bgr[-1], bgr[:, 0], bgr[:, -1]])
    padded = cv2.copyMakeBorder(bgr, p, p, p, p, cv2.BORDER_CONSTANT,
                                value=[float(v) for v in np.median(border, axis=0)])
    blur = cv2.GaussianBlur(padded, (cfg.blur_k, cfg.blur_k), 0)

    def canny(chan: np.ndarray, hi_min: float) -> np.ndarray:
        mag = np.abs(cv2.Sobel(chan, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(chan, cv2.CV_32F, 0, 1))
        hi = float(np.clip(np.percentile(mag, cfg.canny_pct), hi_min, cfg.canny_hi_max))
        log.debug("Canny thresholds lo=%.0f hi=%.0f", cfg.canny_lo_ratio * hi, hi)
        return cv2.Canny(chan, cfg.canny_lo_ratio * hi, hi)

    # brightness edges: box outlines, printed borders
    edges = canny(cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY), cfg.canny_hi_min)
    # chroma edges (Lab a/b): a saturated pill or box on a grey table is almost
    # invisible in grey-scale but has a strong colour step; neutral fabric / wood
    # grain stays far below the floor in a/b
    lab = cv2.cvtColor(blur, cv2.COLOR_BGR2LAB)
    for ch in (1, 2):
        edges = cv2.bitwise_or(edges, canny(np.ascontiguousarray(lab[:, :, ch]), cfg.chroma_hi_min))

    grown = cv2.dilate(edges, _ellipse(cfg.edge_dilate))
    contours, _ = cv2.findContours(grown, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros_like(edges)
    cv2.drawContours(mask, contours, -1, 255, cv2.FILLED)
    mask = cv2.erode(mask, _ellipse(cfg.edge_dilate))
    return mask[p:-p, p:-p]


def _border_median_mask(bgr: np.ndarray, thr: float) -> np.ndarray:
    """
    FALLBACK ONLY (used when the edge detector finds no package).
    Foreground = pixels whose Lab colour is far from the median colour of the image
    border.  Works on plain, uniform backgrounds; fails on textured ones.
    """
    blur = cv2.GaussianBlur(bgr, (5, 5), 0)
    lab = cv2.cvtColor(blur, cv2.COLOR_BGR2LAB).astype(np.float32)
    h, w = lab.shape[:2]
    b = max(4, min(h, w) // 40)
    border = np.concatenate([lab[:b].reshape(-1, 3), lab[-b:].reshape(-1, 3),
                             lab[:, :b].reshape(-1, 3), lab[:, -b:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(lab - bg, axis=2)
    mask = (dist > thr).astype(np.uint8) * 255
    if mask.mean() < 1:                       # nothing found -> fall back to Otsu
        gray = cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return mask


# ---- packaging geometry ----------------------------------------------------
def _rect_stats(contour: np.ndarray) -> tuple[float, float, float]:
    """
    (area, rectangularity, aspect) measured on the ROTATED min-area rectangle.
    rectangularity = area / (w*h) of that rectangle: 1.0 for a box at any angle.
    (The axis-aligned bounding box would score a perfect box tilted by 30 deg at
    only ~0.48 and wrongly reject it.)
    """
    area = float(cv2.contourArea(contour))
    (_, _), (w, h), _ = cv2.minAreaRect(contour)
    if min(w, h) < 1:
        return area, 0.0, 99.0
    return area, area / (w * h), max(w, h) / min(w, h)


def _is_package(contour: np.ndarray, cfg: Config) -> bool:
    _, rect, aspect = _rect_stats(contour)
    return rect >= cfg.min_rectangularity and aspect <= cfg.max_aspect


def _mask_contour(mask: np.ndarray) -> Optional[np.ndarray]:
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(cnts, key=cv2.contourArea) if cnts else None


def _fill(contour: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    cv2.drawContours(m, [contour], -1, 255, cv2.FILLED)
    return m


def _score_pieces(masks: list[np.ndarray], cfg: Config) -> float:
    """Area-weighted rectangularity x solidity of the pieces that pass the package filter."""
    total = score = 0.0
    for m in masks:
        c = _mask_contour(m)
        if c is None:
            continue
        area, rect, aspect = _rect_stats(c)
        solidity = area / max(1.0, cv2.contourArea(cv2.convexHull(c)))
        total += area
        if rect >= cfg.min_rectangularity and aspect <= cfg.max_aspect:
            score += area * rect * solidity
    return score / max(total, 1.0)


def _line_dir(points: np.ndarray) -> np.ndarray:
    return cv2.fitLine(points.astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()[:2]


def _cut_candidates(mask: np.ndarray, min_depth: float) -> list[tuple[tuple, tuple]]:
    """
    Where two boxes touch, the merged outline has concave corners.  From every deep
    concave corner we extend each of the two outline edges straight through the blob
    (the edge of the box lying on top continues across the box below it).
    Returns candidate cut segments ((x0, y0), (x1, y1)).
    """
    c = _mask_contour(mask)
    if c is None or len(c) < 30:
        return []
    try:
        defects = cv2.convexityDefects(c, cv2.convexHull(c, returnPoints=False))
    except cv2.error:
        return []
    if defects is None:
        return []
    pts, n = c[:, 0, :], len(c)
    win = max(12, int(0.02 * max(mask.shape)))
    max_len = int(1.5 * max(mask.shape))
    H, W = mask.shape
    out = []
    for _, _, f, depth in defects.reshape(-1, 4):
        if depth / 256.0 < min_depth:
            continue
        pf = pts[f]
        for sign in (-1, 1):                                    # edge before / after the corner
            idx = [(f + sign * i) % n for i in range(4, 2 * win)]
            d = _line_dir(pts[idx])
            if np.dot(d, pf - pts[idx[len(idx) // 2]]) < 0:     # point from the edge, through the corner
                d = -d
            d = d / (np.linalg.norm(d) + 1e-9)
            q, steps = pf.astype(np.float64) + 3 * d, 0
            while 0 <= int(q[0]) < W and 0 <= int(q[1]) < H and mask[int(q[1]), int(q[0])] and steps < max_len:
                q, steps = q + d, steps + 1
            if steps >= 8:
                out.append((tuple(int(v) for v in pf), tuple(int(v) for v in (q - d))))
    return out


def _pieces_after_cut(mask: np.ndarray, a, b, min_area: float) -> list[np.ndarray]:
    cut = mask.copy()
    cv2.line(cut, a, b, 0, 3)
    n, lab = cv2.connectedComponents((cut > 0).astype(np.uint8))
    pieces = []
    for i in range(1, n):
        p = (lab == i).astype(np.uint8) * 255
        if cv2.countNonZero(p) >= min_area:
            pieces.append(cv2.bitwise_and(cv2.dilate(p, _ellipse(5)), mask))   # give the cut width back
    return pieces


def _watershed_pieces(mask: np.ndarray, min_area: float, cfg: Config):
    """Distance-transform watershed - handles blobs that are blobby rather than corner-shaped."""
    dt = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    mx = float(dt.max())
    best = None
    for frac in (0.4, 0.55, 0.7):
        n, lab = cv2.connectedComponents((dt > frac * mx).astype(np.uint8))
        if n < 3:
            continue
        markers = lab.astype(np.int32)
        markers[mask == 0] = n
        elev = cv2.cvtColor((255 - np.clip(dt / mx * 255, 0, 255)).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        cv2.watershed(elev, markers)
        pieces = []
        for i in range(1, n):
            p = ((markers == i) & (mask > 0)).astype(np.uint8) * 255
            p = cv2.morphologyEx(p, cv2.MORPH_OPEN, _ellipse(5))
            if cv2.countNonZero(p) >= min_area:
                pieces.append(p)
        if len(pieces) >= 2:
            s = _score_pieces(pieces, cfg)
            if best is None or s > best[0]:
                best = (s, pieces)
    return best


def _split_blob(mask: np.ndarray, cfg: Config, min_area: float, min_depth: float,
                depth: int = 0) -> list[np.ndarray]:
    """
    Recursively cut a blob into box-like pieces.  A blob that already looks like
    one clean box (rectangularity >= clean_rectangularity) is left alone; otherwise
    the cut (concave-corner extension or watershed) with the best piece quality wins,
    but only if it beats the un-cut blob by `split_margin` - so a single odd-shaped
    pack (e.g. a box with an open flap) is not chopped up.
    """
    c = _mask_contour(mask)
    if c is None:
        return []
    _, rect, aspect = _rect_stats(c)
    ok = rect >= cfg.min_rectangularity and aspect <= cfg.max_aspect
    if (ok and rect >= cfg.clean_rectangularity) or depth >= 3:
        return [mask]
    best = (_score_pieces([mask], cfg) + (cfg.split_margin if ok else 1e-6), [mask])
    for a, b in _cut_candidates(mask, min_depth):
        pieces = _pieces_after_cut(mask, a, b, min_area)
        trimmed = len(pieces) == 1 and cv2.countNonZero(pieces[0]) < 0.92 * cv2.countNonZero(mask)
        if len(pieces) >= 2 or trimmed:                       # trimmed = a small sliver was cut off
            s = _score_pieces(pieces, cfg)
            if s > best[0]:
                best = (s, pieces)
    ws = _watershed_pieces(mask, min_area, cfg)
    if ws and ws[0] > best[0]:
        best = ws
    if len(best[1]) == 1 and best[1][0] is mask:
        return [mask]
    out: list[np.ndarray] = []
    for p in best[1]:
        out += _split_blob(p, cfg, min_area, min_depth, depth + 1)
    return out


def _extract_packages(mask: np.ndarray, cfg: Config) -> list[np.ndarray]:
    """
    mask -> list of package contours.
      * OPEN (k,k) removes thin protrusions; CLOSE (k+2,k+2) only fills text/foil gaps
        (k ~ 0.7 % of the short image side, i.e. 9 px on a 1600x1200 photo).  The old
        close kernel was 3k - wide enough to weld neighbouring boxes together.
      * every external blob must look like a package (rectangularity / aspect filter);
        blobs that fail - or only barely pass - are split, pieces are re-filtered,
        whatever is left is rejected as shadow / noise.
    """
    H, W = mask.shape
    k = max(3, min(H, W) // 150) | 1
    if cfg.open_k > 1:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _ellipse(cfg.open_k))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _ellipse(k + cfg.close_extra))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_a, max_a = cfg.min_area_frac * H * W, cfg.max_area_frac * H * W
    min_depth = 0.012 * min(H, W)
    packages: list[np.ndarray] = []
    dirty: list[np.ndarray] = []
    for c in contours:
        area, rect, aspect = _rect_stats(c)
        if not (min_a <= area <= max_a):
            continue
        clean = rect >= cfg.clean_rectangularity and aspect <= cfg.max_aspect
        (packages if clean else dirty).append(c)

    for c in dirty:
        blob = _fill(c, (H, W))
        bx, by, bw, bh = cv2.boundingRect(c)
        # a pack whose top edge is faint can leave its brightest label as a separate
        # blob *inside* the bounding box of the rest - take it back before splitting
        inside = []
        for i, o in enumerate(packages):
            ox, oy, ow, oh = cv2.boundingRect(o)
            ix = max(0, min(bx + bw, ox + ow) - max(bx, ox))
            iy = max(0, min(by + bh, oy + oh) - max(by, oy))
            if ix * iy >= 0.8 * ow * oh:
                inside.append(i)
        union = blob.copy()
        for i in inside:
            cv2.drawContours(union, [packages[i]], -1, 255, cv2.FILLED)
        if inside:
            union = cv2.morphologyEx(union, cv2.MORPH_CLOSE, _ellipse(_odd(cfg.absorb_close_frac * min(H, W))))
            cs, _ = cv2.findContours(union, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            union = np.zeros_like(union)
            cv2.drawContours(union, cs, -1, 255, cv2.FILLED)

        pieces = _split_blob(union, cfg, max(min_a, 0.15 * cv2.countNonZero(union)), min_depth)
        refined: list[np.ndarray] = []
        for p in pieces:                                       # second pass: trim slivers per piece
            refined += _split_blob(p, cfg, max(min_a, 0.15 * cv2.countNonZero(p)), min_depth, depth=2)
        kept = []
        for p in refined:
            pc = _mask_contour(p)
            if pc is not None and _is_package(pc, cfg) and cv2.contourArea(pc) >= min_a:
                kept.append(pc)
        if kept:                                               # otherwise: shadow / noise -> rejected
            covered = np.zeros((H, W), np.uint8)
            for kc in kept:
                cv2.drawContours(covered, [kc], -1, 255, cv2.FILLED)
            drop = set()                                       # absorbed packs that a kept piece now covers
            for i in inside:
                own = _fill(packages[i], (H, W))
                if cv2.countNonZero(cv2.bitwise_and(own, covered)) >= 0.5 * cv2.countNonZero(own):
                    drop.add(i)
            packages = [o for i, o in enumerate(packages) if i not in drop] + kept
    return packages


def _odd(n: float) -> int:
    return int(n) | 1


def _polish(contour: np.ndarray, shape: tuple[int, int], k: int) -> np.ndarray:
    """Per-package cleanup AFTER splitting: an opening removes whiskers (fabric folds that
    touch a box edge) without ever influencing how packages were separated."""
    opened = cv2.morphologyEx(_fill(contour, shape), cv2.MORPH_OPEN, _ellipse(k))
    c = _mask_contour(opened)
    return c if c is not None and cv2.contourArea(c) >= 0.85 * cv2.contourArea(contour) else contour


def _upright_crop(bgr: np.ndarray, contour: np.ndarray, pad: int) -> np.ndarray:
    """Perspective-warp the min-area rectangle of `contour` so the pack is axis-aligned."""
    (cx, cy), (w, h), ang = cv2.minAreaRect(contour)
    box = cv2.boxPoints(((cx, cy), (w + 2 * pad, h + 2 * pad), ang))
    s, d = box.sum(axis=1), np.diff(box, axis=1).ravel()
    tl, br, tr, bl = box[s.argmin()], box[s.argmax()], box[d.argmin()], box[d.argmax()]
    W_ = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    H_ = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    if min(W_, H_) < 8:
        x, y, bw, bh = cv2.boundingRect(contour)
        return bgr[y:y + bh, x:x + bw].copy()
    M = cv2.getPerspectiveTransform(np.float32([tl, tr, br, bl]),
                                    np.float32([[0, 0], [W_ - 1, 0], [W_ - 1, H_ - 1], [0, H_ - 1]]))
    return cv2.warpPerspective(bgr, M, (W_, H_), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def segment_items(bgr: np.ndarray, cfg: Config) -> list[Item]:
    """Return one Item (crop + mask + contour) per package found."""
    H, W = bgr.shape[:2]
    contours = _extract_packages(_background_mask(bgr, cfg), cfg)
    method = "canny"
    if not contours:                                       # edge detector found nothing -> colour fallback
        method = "border-median fallback"
        contours = _extract_packages(_border_median_mask(bgr, cfg.bg_threshold), cfg)
    log.info("Segmentation (%s): %d package(s)", method, len(contours))

    k = max(3, min(H, W) // 150) | 1
    contours = [_polish(c, (H, W), k) for c in contours]
    items: list[Item] = []
    for c in sorted(contours, key=cv2.contourArea, reverse=True):
        x, y, w, h = cv2.boundingRect(c)
        p = cfg.crop_pad
        x0, y0, x1, y1 = max(0, x - p), max(0, y - p), min(W, x + w + p), min(H, y + h + p)
        full = _fill(c, (H, W))
        items.append(Item(len(items) + 1, (x0, y0, x1 - x0, y1 - y0),
                          bgr[y0:y1, x0:x1].copy(), full[y0:y1, x0:x1].copy(), c,
                          upright=_upright_crop(bgr, c, p)))
    # reading order: top-to-bottom, left-to-right
    items.sort(key=lambda it: (it.bbox[1] // max(1, H // 6), it.bbox[0]))
    for i, it in enumerate(items, 1):
        it.item_id = i
    return items


# ============================================================================
# 3. Visual attributes (shape + colour)
# ============================================================================
def _circularity(contour: np.ndarray) -> float:
    """4*pi*A / P^2 with P measured on a lightly simplified contour (the raw pixel
    chain is jagged and under-reports a circle as ~0.90)."""
    area = cv2.contourArea(contour)
    p = cv2.arcLength(contour, True)
    p = cv2.arcLength(cv2.approxPolyDP(contour, 0.01 * p, True), True)
    return float(4 * np.pi * area / (p ** 2 + 1e-9))


def classify_shape(contour: np.ndarray) -> str:
    """
    round / capsule / oval / rectangular from the rotated bounding box + contour area.
      rectangularity = area / (w*h)  box 0.9-1.0, stadium 0.88-0.91, ellipse pi/4 = 0.785
      circularity    = 4*pi*A / P^2  circle 1.0, ellipse(2:1) 0.85, stadium(2.5:1) 0.78,
                                     box 1:1 0.79, box 2:1 0.70, box 3:1 0.59
    Packaging is almost always a box, so anything that is not clearly round / oval /
    capsule-like falls through to "rectangular" (never to "round").
    """
    (_, _), (w, h), _ = cv2.minAreaRect(contour)
    if min(w, h) < 1:
        return "unknown"
    aspect = max(w, h) / min(w, h)
    rect = cv2.contourArea(contour) / (w * h)
    circ = _circularity(contour)
    if aspect < 1.25 and circ >= 0.88 and rect < 0.88:     # circle (a box has circ <= 0.79)
        return "round"
    if aspect >= 1.8 and circ >= 0.76 and rect < 0.93:     # stadium / elongated ellipse: capsule, tube
        return "capsule"
    if rect >= 0.88:
        return "rectangular"
    if circ >= 0.85 and rect <= 0.86:                      # ellipse: bottle top view, oval container
        return "oval"
    # ragged / partly hidden outline: decide by the fill ratio of the bounding box
    return "oval" if (circ >= 0.80 and rect < 0.82) else "rectangular"


# (name, hue range in OpenCV units 0-179)
_HUES = [("red", (0, 8)), ("orange", (9, 20)), ("yellow", (21, 33)), ("green", (34, 85)),
         ("blue", (86, 130)), ("purple", (131, 160)), ("pink", (161, 179))]


def dominant_color(crop: np.ndarray, mask: np.ndarray) -> str:
    """
    Name of the dominant *coloured* hue of the object.  If fewer than 8 % of the
    pixels are saturated the object is called white / gray / black by brightness.
    """
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    inside = mask > 0
    if inside.sum() == 0:
        return "unknown"
    h, s, v = hsv[..., 0][inside], hsv[..., 1][inside], hsv[..., 2][inside]
    colored = (s > 70) & (v > 60)
    if colored.mean() >= 0.08:
        hist = np.bincount(h[colored], minlength=180)
        hist = np.convolve(hist, np.ones(5), mode="same")      # smooth
        peak = int(hist.argmax())
        if peak >= 170:
            peak = 0                                           # wrap-around red
        for name, (lo, hi) in _HUES:
            if lo <= peak <= hi:
                return name
    mv = float(v.mean())
    return "white" if mv > 170 else "gray" if mv > 80 else "black"


# ============================================================================
# 4a. OCR (Option A)
# ============================================================================
class OCREngine:
    """Uniform interface:  read(gray_or_bgr_image) -> [(text, confidence 0-1), ...]"""

    def __init__(self, engine: str = "auto"):
        self.name, self._impl = "none", None
        order = ["easyocr", "tesseract"] if engine == "auto" else [engine]
        for cand in order:
            try:
                if cand == "easyocr":
                    import easyocr
                    self._impl = easyocr.Reader(["en"], gpu=False, verbose=False)
                elif cand == "tesseract":
                    import pytesseract
                    pytesseract.get_tesseract_version()
                    self._impl = pytesseract
                else:
                    raise ValueError(cand)
                self.name = cand
                break
            except Exception as exc:                       # missing lib / binary / model
                log.warning("OCR engine '%s' unavailable: %s", cand, str(exc)[:100])
        log.info("OCR engine: %s", self.name)

    def read(self, img: np.ndarray) -> list[tuple[str, float]]:
        if self._impl is None:
            return []
        if self.name == "easyocr":
            return [(t, float(c)) for _, t, c in self._impl.readtext(img)]
        d = self._impl.image_to_data(img, config="--psm 11",
                                     output_type=self._impl.Output.DICT)
        return [(t.strip(), max(0.0, float(c)) / 100.0)
                for t, c in zip(d["text"], d["conf"]) if t.strip() and float(c) >= 0]


def _ocr_angles(shape: str, cfg: Config) -> list[int]:
    """Rectangular packs are de-skewed first, so only the 4 right angles can occur.
    Oval / capsule / round items (bottles, pills) can carry text at any angle."""
    if shape == "rectangular":
        return [0, 90, 180, 270]
    return list(range(0, 360, cfg.ocr_angle_step))


def ocr_item(ocr: OCREngine, item: Item, cfg: Config) -> None:
    """
    OCR one item.
      rectangular : the de-skewed crop, 4 orientations (0/90/180/270)
      oval/capsule/round : the axis-aligned crop, one orientation every 20 deg
    Passes: plain grey first (white-on-dark logos survive), then CLAHE, inverted, and a
    2x-upscaled CLAHE; stop as soon as a pass gives a good reading, keep the best one
    (plus any confident words that other passes found).
    """
    if ocr.name == "none":
        return
    src = item.upright if (item.shape == "rectangular" and item.upright is not None) else item.crop
    gray0 = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    scale = max(1.0, cfg.ocr_min_side / max(gray0.shape))
    if scale > 1:
        gray0 = cv2.resize(gray0, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    def pad(img):
        return cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_REPLICATE)

    plain = pad(gray0)

    def big_clahe():              # last resort (lazy): 2x larger + CLAHE, helps small / glare-faded logos
        f = 2.0 * cfg.ocr_min_side / max(gray0.shape)
        big = cv2.resize(gray0, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
        return pad(cv2.createCLAHE(2.0, (8, 8)).apply(big))

    variants = (lambda: plain, lambda: pad(cv2.createCLAHE(2.0, (8, 8)).apply(gray0)),
                lambda: cv2.bitwise_not(plain), big_clahe)

    def quality(tokens):          # reward long, confident text
        return sum(c * len(re.sub(r"\W", "", t)) for t, c in tokens if c >= cfg.ocr_min_conf)

    angles = _ocr_angles(item.shape, cfg)

    def rotated(img, ang):
        h, w = img.shape
        if ang == 0:
            return img
        if ang in (90, 180, 270):                      # lossless
            return cv2.rotate(img, {90: cv2.ROTATE_90_COUNTERCLOCKWISE, 180: cv2.ROTATE_180,
                                    270: cv2.ROTATE_90_CLOCKWISE}[ang])
        M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
        return cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

    best, best_q = [], 0.0
    pool: dict[str, tuple[str, float]] = {}      # confident whole words seen in ANY pass
    for make in variants:
        base = make()
        for ang in angles:
            tokens = ocr.read(rotated(base, ang))
            q = quality(tokens)
            if q > best_q:
                best, best_q = tokens, q
            for t, c in tokens:
                key = re.sub(r"\W", "", t).upper()
                if c >= cfg.ocr_pool_conf and len(key) >= 4 and c > pool.get(key, ("", 0.0))[1]:
                    pool[key] = (t, c)
        if best_q >= cfg.ocr_good_q:   # clearly readable, skip the remaining passes
            break
    tokens = [(t, c) for t, c in best if c >= cfg.ocr_min_conf]
    have = {re.sub(r"\W", "", t).upper() for t, _ in tokens}
    # a logo washed out by glare may only be read by one variant/angle: keep such words too
    tokens += [v for k, v in pool.items() if k not in have]
    item.ocr_tokens = tokens
    item.ocr_text = " ".join(t for t, _ in item.ocr_tokens)


# ============================================================================
# 4b. CNN embeddings (Option B, optional - needs torch + torchvision)
# ============================================================================
class EmbeddingMatcher:
    """
    ResNet-50 (ImageNet) global-average-pool features + cosine similarity.
    Reference images live in a folder named after the brand:
        reference_images/Panadol.png, reference_images/Panadol_2.jpg, ...
    (file stem up to the first '_' must equal the brand_name in the CSV).
    """

    def __init__(self, ref_dir: str | Path, db: pd.DataFrame):
        import torch
        import torchvision.models as models
        import torchvision.transforms as T

        self.torch = torch
        weights = models.ResNet50_Weights.DEFAULT
        net = models.resnet50(weights=weights)
        net.fc = torch.nn.Identity()
        self.net = net.eval()
        self.tf = T.Compose([T.ToPILImage(), T.Resize((224, 224)), T.ToTensor(),
                             T.Normalize(weights.transforms().mean, weights.transforms().std)])
        self.refs: dict[str, list[np.ndarray]] = {}
        known = {b.lower(): b for b in db["brand_name"]}
        for f in sorted(Path(ref_dir).glob("*")):
            if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".bmp", ".webp"}:
                continue
            brand = known.get(f.stem.split("_")[0].lower())
            img = cv2.imread(str(f))
            if brand and img is not None:
                self.refs.setdefault(brand, []).append(self.embed(img))
        log.info("Embedding refs loaded for %d brands", len(self.refs))

    def embed(self, bgr: np.ndarray) -> np.ndarray:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        with self.torch.no_grad():
            v = self.net(self.tf(rgb).unsqueeze(0))[0].numpy()
        return v / (np.linalg.norm(v) + 1e-9)

    def similarities(self, crop: np.ndarray) -> dict[str, float]:
        """brand -> best cosine similarity mapped to 0..1."""
        q = self.embed(crop)
        return {b: float(max(0.0, max(q @ r for r in refs))) for b, refs in self.refs.items()}


# ============================================================================
# 5. Reference database & matching
# ============================================================================
REQUIRED_COLS = ["brand_name", "generic_name", "imprint", "shape", "dominant_color"]
_COLOR_NEIGHBOURS = {frozenset(p) for p in [("red", "pink"), ("red", "orange"), ("orange", "yellow"),
                                            ("white", "gray"), ("blue", "purple"), ("purple", "pink"),
                                            ("green", "yellow")]}
_SHAPE_NEIGHBOURS = {frozenset(p) for p in [("round", "oval"), ("oval", "capsule")]}


def load_database(path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str).fillna("")
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Database is missing columns: {missing}")
    for c in ("brand_name", "generic_name", "imprint"):
        df[f"_n_{c}"] = df[c].map(norm)
    # individual words of multi-word names ("Chlorhexidine digluconate" -> CHLORHEXIDINE, DIGLUCONATE):
    # packs often print only one of them, or OCR splits them apart
    for c in ("brand_name", "generic_name"):
        df[f"_w_{c}"] = df[c].map(lambda v: [w for w in map(norm, re.split(r"[\s/,+\-]+", v)) if len(w) >= 6])
    return df


def norm(s: str) -> str:
    """Upper-case alphanumerics only - makes OCR matching robust to punctuation."""
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def _text_sim(token: str, target: str) -> float:
    """Similarity of one OCR token to a DB string (0..1). Short codes need exact match."""
    if len(token) < 2 or not target:
        return 0.0
    if len(target) < 4 or len(token) < 4:            # codes / fragments: exact match only
        return 1.0 if token == target else 0.0
    s = _ratio(token, target)
    if len(token) > len(target):                     # token contains the name plus noise
        s = max(s, 0.95 * _partial(target, token))
    if len(target) <= 5 and s < 0.80:                # short brand names: near-exact only
        return 0.0
    return s


def text_score(tokens: list[tuple[str, float]], row: pd.Series) -> tuple[float, str]:
    """Best (score, evidence) of all OCR tokens (+ the concatenation) against one DB row."""
    cands = [(norm(t), c) for t, c in tokens if norm(t)]
    if len(cands) > 1:                               # multi-word names split by OCR
        cands.append(("".join(t for t, _ in cands), float(np.mean([c for _, c in cands]))))
    best, why = 0.0, ""
    for tok, conf in cands:
        targets = [(row["_n_brand_name"], 1.00, "brand_name"), (row["_n_imprint"], 0.95, "imprint"),
                   (row["_n_generic_name"], 0.85, "generic_name")]
        targets += [(w, 0.80, "generic_name") for w in row["_w_generic_name"]]
        targets += [(w, 0.95, "brand_name") for w in row["_w_brand_name"]]
        for target, weight, col in targets:
            s = _text_sim(tok, target) * weight * (0.6 + 0.4 * conf)
            if s > best:
                best, why = s, f"'{tok}'~{col}"
    return best, why


def attribute_score(shape: str, color: str, row: pd.Series) -> float:
    """0..1 agreement of observed shape/colour with the DB row (partial credit for near-misses)."""
    def part(a, b, nb):
        a, b = a.lower(), b.lower()
        return 1.0 if a == b else 0.4 if frozenset((a, b)) in nb else 0.0
    return 0.5 * part(shape, row["shape"], _SHAPE_NEIGHBOURS) + \
           0.5 * part(color, row["dominant_color"], _COLOR_NEIGHBOURS)


def match_item(item: Item, db: pd.DataFrame, cfg: Config,
               emb_sims: Optional[dict[str, float]] = None) -> list[dict]:
    """Score every DB row for one item and return the top-k candidates."""
    has_text = bool(item.ocr_tokens)
    rows = []
    for _, row in db.iterrows():
        t, why = text_score(item.ocr_tokens, row) if has_text else (0.0, "")
        a = attribute_score(item.shape, item.color, row)
        e = emb_sims.get(row["brand_name"]) if emb_sims else None

        comps = {"attr": (cfg.w_attr, a)}
        if has_text:
            comps["text"] = (cfg.w_text, t)
        if e is not None:
            comps["emb"] = (cfg.w_emb, e)
        score = sum(w * v for w, v in comps.values()) / sum(w for w, _ in comps.values())
        if not has_text:                       # no textual evidence -> never "confident"
            score *= 0.60 if e is not None else 0.40   # scaled (not clipped) so ranking is kept
        rows.append({"brand_name": row["brand_name"], "generic_name": row["generic_name"],
                     "score": round(float(score), 3), "text": round(t, 3), "attr": round(a, 3),
                     "emb": None if e is None else round(e, 3), "evidence": why})
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows[:cfg.top_k]


def decide(cands: list[dict], cfg: Config) -> tuple[Optional[str], str]:
    """Turn ranked candidates into (status, reason) - handles ambiguity gracefully."""
    if not cands:
        return "unknown", "no candidates"
    top = cands[0]["score"]
    gap = top - (cands[1]["score"] if len(cands) > 1 else 0.0)
    if top >= cfg.confident_score and gap >= cfg.margin:
        return "confident", ""
    if top >= cfg.confident_score:
        return "ambiguous", f"top-2 within {gap:.2f}"
    if top >= cfg.low_score:
        return "low_confidence", "weak evidence"
    return "unknown", "no convincing match"


# ============================================================================
# 6. Orchestration & reporting
# ============================================================================
def identify(image_path, db_path, engine="auto", cfg: Optional[Config] = None,
             embeddings: Optional[EmbeddingMatcher] = None,
             out_dir: Optional[str | Path] = None) -> pd.DataFrame:
    cfg = cfg or Config()
    db = load_database(db_path)
    bgr = load_image(image_path, cfg.max_side)

    items = segment_items(bgr, cfg)          # raw image: contrast boosting would amplify fabric/wood texture
    log.info("Segmented %d item(s)", len(items))
    if not items:                                       # nothing separable: treat whole photo as one item
        h, w = bgr.shape[:2]
        cnt = np.array([[[0, 0]], [[w - 1, 0]], [[w - 1, h - 1]], [[0, h - 1]]], np.int32)
        items = [Item(1, (0, 0, w, h), bgr.copy(), np.full((h, w), 255, np.uint8), cnt)]

    ocr = OCREngine(engine)
    records = []
    for it in items:
        it.shape = classify_shape(it.contour)
        it.color = dominant_color(it.crop, it.mask)
        ocr_item(ocr, it, cfg)
        sims = embeddings.similarities(it.crop) if embeddings and embeddings.refs else None
        cands = match_item(it, db, cfg, sims)
        status, reason = decide(cands, cfg)
        best = cands[0] if cands else {}
        records.append({
            "item_id": it.item_id,
            "bbox": list(it.bbox),
            "box": cv2.boxPoints(cv2.minAreaRect(it.contour)).astype(int).tolist(),
            "shape": it.shape,
            "color": it.color,
            "ocr_text": it.ocr_text,
            "brand_name": best.get("brand_name") if status in ("confident", "ambiguous", "low_confidence") else None,
            "generic_name": best.get("generic_name") if status in ("confident", "ambiguous", "low_confidence") else None,
            "confidence": best.get("score", 0.0),
            "status": status,
            "note": reason,
            "top_k": [{k: c[k] for k in ("brand_name", "generic_name", "score", "evidence")} for c in cands],
        })
    df = pd.DataFrame(records)

    if out_dir:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        df.to_json(out / "results.json", orient="records", indent=2)
        df.to_csv(out / "results.csv", index=False)
        cv2.imwrite(str(out / "annotated.png"), annotate(bgr, df))
        log.info("Saved results.json / results.csv / annotated.png to %s", out)
    return df


def annotate(bgr: np.ndarray, df: pd.DataFrame) -> np.ndarray:
    """Draw boxes + predicted names on a copy of the image."""
    vis = bgr.copy()
    colors = {"confident": (0, 170, 0), "ambiguous": (0, 160, 255),
              "low_confidence": (0, 160, 255), "unknown": (0, 0, 220)}
    for _, r in df.iterrows():
        x, y, w, h = r["bbox"]
        col = colors[r["status"]]
        cv2.polylines(vis, [np.array(r["box"], np.int32)], True, col, 3, cv2.LINE_AA)   # rotated box
        label = f"#{r['item_id']} {r['brand_name'] or '?'} {r['confidence']:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(vis, (x, max(0, y - th - 8)), (x + tw + 6, y), col, -1)
        cv2.putText(vis, label, (x + 3, max(th, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (255, 255, 255), 1, cv2.LINE_AA)
    return vis


def print_summary(df: pd.DataFrame) -> None:
    show = df.copy()
    show["top_k"] = show["top_k"].map(
        lambda l: "; ".join(f"{c['brand_name']} ({c['score']:.2f})" for c in l))
    show["confidence"] = show["confidence"].map(lambda v: f"{v:.2f}")
    show["ocr_text"] = show["ocr_text"].str.slice(0, 28)
    cols = ["item_id", "shape", "color", "ocr_text", "brand_name", "generic_name",
            "confidence", "status", "top_k"]
    with pd.option_context("display.max_columns", None, "display.width", 250,
                           "display.max_colwidth", 70):
        print("\n" + show[cols].fillna("-").to_string(index=False))
    print("\n(Educational prototype - always verify medicines with a pharmacist.)")


# ============================================================================
# Mock data generator (reference CSV + synthetic test photo)
# ============================================================================
MOCK_DB = [
    # brand,       generic,                  imprint, shape,       colour,  strength, form
    ("Panadol",    "Paracetamol",            "P500",  "rectangular", "blue",   "500 mg",  "blister_pack"),
    ("Advil",      "Ibuprofen",              "AD200", "rectangular", "orange", "200 mg",  "blister_pack"),
    ("Zyrtec",     "Cetirizine",             "ZY10",  "rectangular", "green",  "10 mg",   "blister_pack"),
    ("Augmentin",  "Amoxicillin/Clavulanate", "AUG",  "rectangular", "pink",   "625 mg",  "box"),
    ("Lipitor",    "Atorvastatin",           "PD155", "round",       "white",  "20 mg",   "tablet"),
    ("Glucophage", "Metformin",              "GP500", "oval",        "white",  "500 mg",  "tablet"),
    ("Voltaren",   "Diclofenac",             "VOL50", "round",       "yellow", "50 mg",   "tablet"),
    ("Prozac",     "Fluoxetine",             "PRZ20", "capsule",     "green",  "20 mg",   "capsule"),
]


def make_mock(out_dir: str | Path) -> None:
    """Write mock_db.csv and a synthetic test_image.png containing 5 products."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(MOCK_DB, columns=["brand_name", "generic_name", "imprint", "shape",
                                   "dominant_color", "strength", "form"]).to_csv(out / "mock_db.csv", index=False)

    H, W = 900, 1300
    img = np.full((H, W, 3), (150, 165, 175), np.uint8)       # warm-gray tabletop (BGR)
    rng = np.random.default_rng(0)
    img = cv2.add(img, rng.integers(0, 6, img.shape, dtype=np.uint8))   # sensor noise

    def paste(patch, cx, cy, angle):
        """Rotate a patch+alpha around its centre and alpha-blend it onto img."""
        h, w = patch.shape[:2]
        d = int(np.hypot(h, w)) + 4
        canvas = np.zeros((d, d, 4), np.uint8)
        oy, ox = (d - h) // 2, (d - w) // 2
        canvas[oy:oy + h, ox:ox + w, :3] = patch[..., :3]
        canvas[oy:oy + h, ox:ox + w, 3] = patch[..., 3]
        M = cv2.getRotationMatrix2D((d / 2, d / 2), angle, 1)
        rot = cv2.warpAffine(canvas, M, (d, d), flags=cv2.INTER_LINEAR)
        x0, y0 = int(cx - d / 2), int(cy - d / 2)
        roi = img[y0:y0 + d, x0:x0 + d]
        a = rot[..., 3:4] / 255.0
        roi[:] = (rot[..., :3] * a + roi * (1 - a)).astype(np.uint8)

    def pack(w, h, band_bgr, text, sub):
        p = np.zeros((h, w, 4), np.uint8)
        p[..., :3] = (245, 245, 245)
        p[..., 3] = 255
        p[: h // 3] = (*band_bgr, 255)
        cv2.putText(p, text, (14, h // 4 + 8), cv2.FONT_HERSHEY_DUPLEX, 1.5, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(p, sub, (14, h // 2 + 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (40, 40, 40), 2, cv2.LINE_AA)
        for i in range(6):                                   # fake blister cells
            cv2.circle(p, (40 + i * (w - 60) // 6, h - 50), 22, (200, 200, 200), -1)
        return p

    def pill(d, color, imprint, shape):
        w, h = (d, d) if shape == "round" else (int(d * 1.5), d) if shape == "oval" else (int(d * 2.2), int(d * .8))
        p = np.zeros((h + 4, w + 4, 4), np.uint8)
        cx, cy = (w + 4) // 2, (h + 4) // 2
        if shape == "round":
            cv2.circle(p, (cx, cy), d // 2, (*color, 255), -1)
        else:
            cv2.ellipse(p, (cx, cy), (w // 2, h // 2), 0, 0, 360, (*color, 255), -1)
        cv2.putText(p, imprint, (cx - int(w * .42), cy + 10), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8 if shape != "round" else 0.7, (90, 90, 90, 255), 2, cv2.LINE_AA)
        return p

    # BGR colours
    paste(pack(430, 250, (190, 90, 20), "Panadol", "Paracetamol 500mg"), 300, 270, -8)
    paste(pack(430, 250, (30, 120, 240), "ADVIL", "Ibuprofen 200mg"), 900, 280, 6)
    paste(pack(430, 250, (60, 160, 40), "ZYRTEC", "Cetirizine 10mg"), 330, 640, 4)
    paste(pill(150, (245, 245, 245), "PD155", "round"), 870, 600, 15)
    paste(pill(130, (60, 200, 235), "VOL50", "round"), 1100, 780, 0)
    cv2.imwrite(str(out / "test_image.png"), img)
    print(f"Wrote {out/'mock_db.csv'} and {out/'test_image.png'}")


# ============================================================================
# CLI
# ============================================================================
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("make-mock", help="create a mock DB CSV and a synthetic test image")
    m.add_argument("--out", default="mock")

    i = sub.add_parser("identify", help="identify drugs in an image")
    i.add_argument("image")
    i.add_argument("--db", required=True, help="reference CSV (see README for columns)")
    i.add_argument("--engine", default="auto", choices=["auto", "easyocr", "tesseract"])
    i.add_argument("--top-k", type=int, default=3)
    i.add_argument("--out", default=None, help="folder for results.json/csv + annotated.png")
    i.add_argument("--embeddings", action="store_true", help="enable CNN embedding matching (Option B)")
    i.add_argument("--ref-dir", default="reference_images")
    i.add_argument("-v", "--verbose", action="store_true")

    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if getattr(args, "verbose", False) else logging.WARNING,
                        format="%(levelname)s %(message)s")
    if args.cmd == "make-mock":
        make_mock(args.out)
        return 0

    cfg = Config(top_k=args.top_k)
    emb = None
    if args.embeddings:
        emb = EmbeddingMatcher(args.ref_dir, load_database(args.db))
    df = identify(args.image, args.db, args.engine, cfg, emb, args.out)
    print_summary(df)
    print("\nJSON:\n" + df.drop(columns=["bbox", "box"]).to_json(orient="records", indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
