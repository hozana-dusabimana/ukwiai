"""Procedural dataset synthesiser for the seven basketball-court construction stages.

We render PNG images on the fly with cv2/numpy. Each stage has a distinct visual
signature that mirrors the cues a real CNN would pick up on a labelled dataset:

  stage 1: bare earth, machinery silhouette, irregular soil patches
  stage 2: gravel sub-base, levelled rectangular pad, edge stakes
  stage 3: bright concrete slab, formwork lines, exposed rebar fragments
  stage 4: dark asphalt/acrylic surface, smooth uniform finish
  stage 5: asphalt + painted court lines (free-throw, 3-point arc, key)
  stage 6: stage 5 + hoop poles, backboards
  stage 7: stage 6 + perimeter chain-link fencing, lights, benches

For each stage we sample many degrees of freedom (camera tilt, lighting, scene
clutter, fence color, sky proportion, etc.) so the same class produces visually
diverse images. The pipeline writes into the standard
`{train,val,test}/stage_N/*.png` layout the existing trainer already consumes.
"""
from __future__ import annotations
import argparse
import math
from pathlib import Path
import numpy as np
import cv2

RNG = np.random.default_rng(42)
W, H = 320, 320     # render at 320, the trainer resizes to 224


# OpenCV in Python rejects numpy scalars for color/coordinate args ("Scalar value …
# is not numeric"). These helpers cast everything to native ints.
def _i(x) -> int:
    return int(x)


def _ri(lo, hi) -> int:
    return int(RNG.integers(lo, hi))


def _rc() -> tuple[int, int, int]:
    return (_ri(0, 256), _ri(0, 256), _ri(0, 256))


def _bgr(r, g, b) -> tuple[int, int, int]:
    """Accept RGB-ordered ints, return BGR tuple ready for cv2."""
    return (int(b), int(g), int(r))


def _pt(x, y) -> tuple[int, int]:
    return (int(x), int(y))


# ---------------------------------------------------------------- helpers
def _noise(shape, sigma):
    return RNG.normal(0, sigma, shape).astype(np.float32)


def _grad_v(top_rgb, bot_rgb):
    """Vertical gradient. top_rgb / bot_rgb supplied as RGB; returns a BGR canvas
    matching cv2's native channel order so cv2.imwrite produces correct colours."""
    top_bgr = (top_rgb[2], top_rgb[1], top_rgb[0])
    bot_bgr = (bot_rgb[2], bot_rgb[1], bot_rgb[0])
    a = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None, None]
    return (np.array(top_bgr, dtype=np.float32) * (1 - a) +
            np.array(bot_bgr, dtype=np.float32) * a) * np.ones((H, W, 3), dtype=np.float32)


def _rotate(img, deg):
    M = cv2.getRotationMatrix2D((W / 2, H / 2), deg, 1.0)
    return cv2.warpAffine(img, M, (W, H), borderMode=cv2.BORDER_REFLECT)


def _persp(img, max_warp=0.06):
    """Light random perspective warp to simulate camera angle."""
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    jitter = RNG.uniform(-max_warp, max_warp, (4, 2)) * np.array([W, H])
    dst = src + jitter
    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    return cv2.warpPerspective(img, M, (W, H), borderMode=cv2.BORDER_REFLECT)


def _add_sky(img, sky_h_frac=None):
    if sky_h_frac is None:
        sky_h_frac = RNG.uniform(0.0, 0.35)
    if sky_h_frac < 0.05:
        return img
    sky_h = int(H * sky_h_frac)
    blue = float(RNG.uniform(160, 220))
    # Channel order is BGR. Sky is mostly blue, less green, even less red.
    sky = np.stack([
        np.full((sky_h, W), blue, dtype=np.float32),                                       # B
        np.full((sky_h, W), blue * float(RNG.uniform(0.7, 0.85)), dtype=np.float32),       # G
        np.full((sky_h, W), blue * float(RNG.uniform(0.45, 0.65)), dtype=np.float32),      # R
    ], axis=-1)
    sky += _noise(sky.shape, 4)
    img[:sky_h] = sky
    return img


def _add_grass_border(img, frac=None):
    if frac is None:
        frac = RNG.uniform(0.0, 0.18)
    if frac < 0.03:
        return img
    border = int(W * frac)
    # BGR for green grass: low blue, high green, mid-low red.
    green_bgr = np.array([50, 110, 60], dtype=np.float32)
    grass = np.full((H, border, 3), green_bgr, dtype=np.float32) + _noise((H, border, 3), 14)
    img[:, :border] = grass
    img[:, W - border:] = grass + _noise((H, border, 3), 6)
    return img


def _vignette(img):
    yy, xx = np.mgrid[0:H, 0:W]
    cy, cx = H / 2, W / 2
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    mask = 1.0 - 0.35 * (r / r.max()) ** 2
    return img * mask[..., None]


def _light_jitter(img, brightness_range=(0.78, 1.18)):
    f = RNG.uniform(*brightness_range)
    return np.clip(img * f, 0, 255)


def _cast_shadow(img):
    if RNG.random() < 0.4:
        x0 = RNG.integers(0, W // 2)
        x1 = RNG.integers(W // 2, W)
        y0 = RNG.integers(0, H // 2)
        y1 = RNG.integers(H // 2, H)
        img[y0:y1, x0:x1] *= RNG.uniform(0.55, 0.85)
    return img


def _finalize(img):
    img = np.clip(img, 0, 255)
    return img.astype(np.uint8)


# ---------------------------------------------------------------- per-stage renderers
def render_stage1():
    """Site clearing: bare earth, machinery silhouettes, soil heaps."""
    # Soil = warm brown: high R, mid G, low B.
    base = _grad_v((140, 100, 70), (175, 130, 90))
    base += _noise(base.shape, 25)
    for _ in range(_ri(2, 6)):
        cx, cy = _ri(0, W), _ri(H * 3 // 4, H)
        rx, ry = _ri(20, 70), _ri(10, 30)
        # Heap: dark brown (R, G, B)
        color = _bgr(_ri(95, 140), _ri(65, 95), _ri(45, 75))
        cv2.ellipse(base, _pt(cx, cy), _pt(rx, ry), _ri(0, 180), 0, 360, color, -1)
    for _ in range(_ri(0, 4)):
        y = _ri(H // 2, H - 20)
        cv2.line(base, _pt(0, y), _pt(W, y + _ri(-10, 10)),
                 _bgr(_ri(80, 130), _ri(55, 90), _ri(35, 70)), 3)
    if RNG.random() < 0.3:
        x = _ri(50, W - 80)
        y = _ri(H // 3, H * 2 // 3)
        cv2.rectangle(base, _pt(x, y), _pt(x + 60, y + 40), _bgr(40, 40, 50), -1)
        cv2.rectangle(base, _pt(x + 10, y - 20), _pt(x + 50, y), _bgr(50, 50, 60), -1)
    base = _add_sky(base)
    base = _light_jitter(base)
    base = _cast_shadow(base)
    return _finalize(_persp(base))


def render_stage2():
    """Sub-base: levelled gravel rectangle, lighter than soil, faint texture."""
    base = _grad_v((125, 120, 110), (145, 138, 125))
    base += _noise(base.shape, 30)
    pad_x = _ri(20, 50)
    pad_y = _ri(40, 80)
    cv2.rectangle(base, _pt(pad_x, pad_y), _pt(W - pad_x, H - pad_y // 2),
                  _bgr(140, 135, 125), -1)
    inner = base[pad_y:H - pad_y // 2, pad_x:W - pad_x]
    inner += _noise(inner.shape, 18)
    for x in (pad_x, W - pad_x):
        cv2.line(base, _pt(x, pad_y), _pt(x, H - pad_y // 2), _bgr(70, 55, 40), 2)
    base = _add_sky(base)
    base = _add_grass_border(base)
    base = _light_jitter(base)
    return _finalize(_persp(base))


def render_stage3():
    """Concrete slab: bright grey, formwork, occasional rebar."""
    base = _grad_v((175, 175, 178), (195, 195, 198))
    base += _noise(base.shape, 6)
    pad = _ri(15, 35)
    cv2.rectangle(base, _pt(pad, pad + 20), _pt(W - pad, H - pad), _bgr(90, 75, 50), 4)
    for _ in range(_ri(0, 5)):
        x0, y0 = _ri(0, W), _ri(0, H)
        x1, y1 = x0 + _ri(-30, 30), y0 + _ri(-30, 30)
        cv2.line(base, _pt(x0, y0), _pt(x1, y1), _bgr(160, 160, 160), 1)
    if RNG.random() < 0.45:
        bx = _ri(20, W - 60)
        by = _ri(H // 2, H - 80)
        for i in range(_ri(3, 7)):
            cv2.line(base, _pt(bx + i * 5, by), _pt(bx + i * 5, by + 60),
                     _bgr(130, 130, 130), 1)
    base = _add_sky(base, sky_h_frac=float(RNG.uniform(0.0, 0.18)))
    base = _light_jitter(base)
    base = _cast_shadow(base)
    return _finalize(_persp(base))


def render_stage4():
    """Asphalt/acrylic surface: dark, smooth, uniform."""
    color_choice = str(RNG.choice(["asphalt", "green", "blue"]))
    # All tuples expressed as RGB; _grad_v converts to BGR for cv2.
    if color_choice == "asphalt":
        top, bot = (45, 45, 48), (60, 60, 65)
    elif color_choice == "green":
        # Acrylic court green
        top, bot = (50, 110, 55), (70, 130, 75)
    else:
        # Acrylic court blue
        top, bot = (40, 80, 140), (55, 95, 155)
    base = _grad_v(top, bot)
    base += _noise(base.shape, 3)
    base = _add_sky(base, sky_h_frac=float(RNG.uniform(0.0, 0.15)))
    base = _add_grass_border(base, frac=float(RNG.uniform(0.0, 0.12)))
    base = _light_jitter(base)
    base = _cast_shadow(base)
    return _finalize(_persp(base))


def _draw_court_lines(base, court_color="asphalt"):
    """Overlay realistic basketball-court line markings."""
    line_color = _bgr(255, 255, 255)
    pad = _ri(20, 35)
    cv2.rectangle(base, _pt(pad, pad + 30), _pt(W - pad, H - pad), line_color, 2)
    cy = (pad + 30 + H - pad) // 2
    cv2.line(base, _pt(pad, cy), _pt(W - pad, cy), line_color, 2)
    cv2.circle(base, _pt(W // 2, cy), 22, line_color, 2)
    for x_anchor in (pad + 5, W - pad - 5):
        if x_anchor == pad + 5:
            cv2.rectangle(base, _pt(x_anchor, cy - 35), _pt(x_anchor + 50, cy + 35), line_color, 2)
            cv2.circle(base, _pt(x_anchor + 50, cy), 18, line_color, 2)
        else:
            cv2.rectangle(base, _pt(x_anchor - 50, cy - 35), _pt(x_anchor, cy + 35), line_color, 2)
            cv2.circle(base, _pt(x_anchor - 50, cy), 18, line_color, 2)
    if RNG.random() < 0.5:
        key_color = _bgr(_ri(40, 90), _ri(60, 200), _ri(40, 90))
        cv2.rectangle(base, _pt(pad + 6, cy - 33), _pt(pad + 54, cy + 33), key_color, -1)
        cv2.rectangle(base, _pt(W - pad - 54, cy - 33), _pt(W - pad - 6, cy + 33), key_color, -1)
        cv2.rectangle(base, _pt(pad + 5, cy - 35), _pt(pad + 55, cy + 35), line_color, 2)
        cv2.rectangle(base, _pt(W - pad - 55, cy - 35), _pt(W - pad - 5, cy + 35), line_color, 2)
    return base


def render_stage5():
    """Court line marking: stage-4 surface + court lines."""
    base = render_stage4().astype(np.float32)
    base = _draw_court_lines(base)
    base = _light_jitter(base, (0.85, 1.1))
    return _finalize(base)


def _draw_hoop(base, x, y_top):
    pole_color = _bgr(210, 210, 215)
    backboard_color = _bgr(240, 240, 245)
    cv2.line(base, _pt(x, y_top + 45), _pt(x, H - 30), pole_color, 4)
    cv2.rectangle(base, _pt(x - 25, y_top), _pt(x + 25, y_top + 35), backboard_color, -1)
    cv2.rectangle(base, _pt(x - 25, y_top), _pt(x + 25, y_top + 35), _bgr(60, 60, 60), 2)
    cv2.rectangle(base, _pt(x - 8, y_top + 12), _pt(x + 8, y_top + 28), _bgr(200, 60, 60), 2)
    cv2.ellipse(base, _pt(x, y_top + 38), _pt(10, 4), 0, 0, 360, _bgr(220, 80, 40), 2)
    return base


def render_stage6():
    """Hoops + backboards installed."""
    base = render_stage5().astype(np.float32)
    cx = W // 2
    base = _draw_hoop(base, cx, _ri(20, 40))
    if RNG.random() < 0.5:
        base = _draw_hoop(base, cx + _ri(-30, 30), H - 130)
    base = _light_jitter(base, (0.9, 1.05))
    return _finalize(base)


def render_stage7():
    """Fencing & final touches: stage 6 + chain-link fence + lights."""
    base = render_stage6().astype(np.float32)
    fence_color = _bgr(180, 180, 180)
    fence_top = 0
    fence_bottom = H // 3
    spacing = 12
    for k in range(-W, W * 2, spacing):
        cv2.line(base, _pt(k, fence_top), _pt(k + (fence_bottom - fence_top), fence_bottom),
                 fence_color, 1)
        cv2.line(base, _pt(k, fence_bottom), _pt(k + (fence_bottom - fence_top), fence_top),
                 fence_color, 1)
    for x in range(20, W, 80):
        cv2.line(base, _pt(x, fence_top), _pt(x, fence_bottom + 5), _bgr(120, 120, 120), 3)
    if RNG.random() < 0.6:
        x = _ri(30, W - 30)
        cv2.line(base, _pt(x, 0), _pt(x, H - 10), _bgr(200, 200, 210), 2)
        cv2.circle(base, _pt(x, _ri(10, 30)), 6, _bgr(255, 240, 180), -1)
    base = _light_jitter(base, (0.85, 1.05))
    return _finalize(base)


RENDERERS = {
    1: render_stage1,
    2: render_stage2,
    3: render_stage3,
    4: render_stage4,
    5: render_stage5,
    6: render_stage6,
    7: render_stage7,
}


# ---------------------------------------------------------------- driver
def generate(out_root: Path, per_class: dict[str, int]):
    """per_class: {"train": 200, "val": 50, "test": 30}"""
    for split, n in per_class.items():
        for stage in range(1, 8):
            d = out_root / split / f"stage_{stage}"
            d.mkdir(parents=True, exist_ok=True)
            for i in range(n):
                img = RENDERERS[stage]()
                # progress = midpoint ± a small jitter inside the band
                from ..stages import STAGES
                band = STAGES[stage - 1]
                p = float(RNG.uniform(band.progress_lo, band.progress_hi))
                fname = f"synth_{i:04d}_p{int(p)}.png"
                cv2.imwrite(str(d / fname), img)
            print(f"  {split}/stage_{stage}: {n} images")


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/app/data", help="data root")
    ap.add_argument("--train-per-class", type=int, default=200)
    ap.add_argument("--val-per-class", type=int, default=50)
    ap.add_argument("--test-per-class", type=int, default=30)
    return ap.parse_args()


def main():
    a = parse_args()
    counts = {"train": a.train_per_class, "val": a.val_per_class, "test": a.test_per_class}
    print(f"Rendering synthetic data into {a.out} ({counts})")
    generate(Path(a.out), counts)
    print("Done.")


if __name__ == "__main__":
    main()
