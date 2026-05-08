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


# ---------------------------------------------------------------- texture utils
def _multi_octave_noise(shape, octaves=4, persistence=0.55, sigma_scale=20.0):
    """Approximate Perlin/multi-octave noise via summed gaussian blurs at
    progressively higher frequencies. Produces organic-looking textures (cracks,
    soil clumps, asphalt grain) much more realistic than flat gaussian noise."""
    H_, W_ = shape[:2]
    out = np.zeros((H_, W_), dtype=np.float32)
    amp = 1.0
    for o in range(octaves):
        sigma = max(0.5, sigma_scale / (2 ** o))
        seed = RNG.normal(0, 1, (H_, W_)).astype(np.float32)
        smoothed = cv2.GaussianBlur(seed, (0, 0), sigma)
        # Re-normalise after blur so amplitudes are comparable across octaves.
        s = smoothed.std() or 1.0
        out += (smoothed / s) * amp
        amp *= persistence
    out -= out.mean()
    out /= max(out.std(), 1e-6)
    return out  # zero-mean, unit-std, range typically [-3, 3]


def _texture_modulate(base_color_bgr, shape, intensity=18.0, sigma_scale=14.0):
    """Return an HxWx3 texture by modulating a BGR base colour with noise."""
    n = _multi_octave_noise(shape, octaves=4, persistence=0.55, sigma_scale=sigma_scale)
    base = np.full((shape[0], shape[1], 3),
                   np.array(base_color_bgr, dtype=np.float32))
    return base + np.repeat((n * intensity)[..., None], 3, axis=-1)


def _add_color_temperature(img, kelvin_shift=None):
    """Random warm/cool tint to simulate sunlight at different times of day."""
    if kelvin_shift is None:
        kelvin_shift = float(RNG.uniform(-1.0, 1.0))
    # Positive => warmer (more red, less blue); negative => cooler.
    img[..., 0] *= (1.0 - 0.06 * kelvin_shift)  # B
    img[..., 2] *= (1.0 + 0.06 * kelvin_shift)  # R
    return img


def _motion_blur(img, kernel_size=None):
    if kernel_size is None:
        kernel_size = int(RNG.integers(3, 8))
    if kernel_size < 3:
        return img
    angle = float(RNG.uniform(-30, 30))
    k = np.zeros((kernel_size, kernel_size), dtype=np.float32)
    k[kernel_size // 2, :] = 1.0
    M = cv2.getRotationMatrix2D((kernel_size / 2, kernel_size / 2), angle, 1.0)
    k = cv2.warpAffine(k, M, (kernel_size, kernel_size))
    k /= max(k.sum(), 1e-6)
    return cv2.filter2D(img, -1, k)


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
    """Site clearing: bare earth, multi-octave soil texture, machinery, heaps."""
    # Multi-octave brown soil with realistic clumping.
    soil_bgr = (_ri(60, 90), _ri(85, 120), _ri(125, 160))   # B, G, R for warm soil
    base = _texture_modulate(soil_bgr, (H, W), intensity=22.0, sigma_scale=18.0)
    # Add darker tracked-mud strips (vehicle treads).
    for _ in range(_ri(0, 3)):
        y = _ri(H // 3, H - 20)
        thickness = _ri(8, 22)
        for dx in range(thickness):
            cv2.line(base, _pt(0, y + dx - thickness // 2),
                     _pt(W, y + dx - thickness // 2 + _ri(-6, 6)),
                     _bgr(_ri(35, 70), _ri(55, 80), _ri(80, 110)), 1)
    # Soil heaps with gradient shading (3D illusion).
    for _ in range(_ri(2, 6)):
        cx, cy = _ri(20, W - 20), _ri(H * 3 // 5, H - 5)
        rx, ry = _ri(25, 80), _ri(15, 35)
        for r_step in range(rx, 0, -2):
            shade = 0.6 + 0.4 * (1 - r_step / rx)
            color = _bgr(int(95 * shade), int(70 * shade), int(50 * shade))
            cv2.ellipse(base, _pt(cx, cy), _pt(r_step, max(1, int(ry * r_step / rx))),
                        _ri(0, 180), 0, 360, color, -1)
    # Machinery silhouette (excavator/truck).
    if RNG.random() < 0.5:
        x = _ri(40, W - 100)
        y = _ri(H // 3, H * 2 // 3)
        # Body
        cv2.rectangle(base, _pt(x, y), _pt(x + 70, y + 40),
                      _bgr(_ri(160, 220), _ri(120, 180), _ri(40, 80)), -1)
        # Cabin
        cv2.rectangle(base, _pt(x + 10, y - 25), _pt(x + 50, y),
                      _bgr(_ri(170, 230), _ri(130, 180), _ri(40, 90)), -1)
        # Boom arm
        cv2.line(base, _pt(x + 60, y + 10), _pt(x + 110, y - 30),
                 _bgr(_ri(170, 220), _ri(120, 170), _ri(40, 80)), 4)
        # Tracks (dark)
        cv2.rectangle(base, _pt(x - 5, y + 35), _pt(x + 75, y + 50), _bgr(20, 20, 25), -1)
    base = _add_sky(base)
    base = _add_color_temperature(base)
    base = _light_jitter(base)
    base = _cast_shadow(base)
    if RNG.random() < 0.2:
        base = _motion_blur(base, kernel_size=3)
    return _finalize(_persp(base))


def render_stage2():
    """Sub-base: compacted gravel pad — coarse gritty texture distinct from soil
    (cooler/greyer), surrounded by leftover dirt at the edges."""
    # Soil-y surround.
    base = _texture_modulate((75, 95, 130), (H, W), intensity=20.0, sigma_scale=18.0)
    # Levelled gravel pad in centre — cooler grey, finer multi-octave grain.
    pad_x = _ri(20, 50)
    pad_y_top = _ri(40, 80)
    pad_y_bot = H - _ri(15, 40)
    pad_h = pad_y_bot - pad_y_top
    pad_w = (W - 2 * pad_x)
    gravel = _texture_modulate((110, 115, 120), (pad_h, pad_w),
                               intensity=14.0, sigma_scale=6.0)
    # Add bright stone speckles characteristic of crushed aggregate.
    speckle = (RNG.random((pad_h, pad_w)) > 0.97).astype(np.float32)
    speckle_color = np.full((pad_h, pad_w, 3), [200, 200, 200], dtype=np.float32)
    gravel = np.where(speckle[..., None] > 0, speckle_color, gravel)
    base[pad_y_top:pad_y_bot, pad_x:pad_x + pad_w] = gravel
    # Survey stakes around the pad perimeter.
    for x in (pad_x, W - pad_x):
        cv2.line(base, _pt(x, pad_y_top), _pt(x, pad_y_bot), _bgr(70, 55, 40), 2)
    # Compactor track marks across the gravel.
    for _ in range(_ri(1, 3)):
        y = _ri(pad_y_top + 10, pad_y_bot - 10)
        cv2.line(base, _pt(pad_x + 5, y), _pt(pad_x + pad_w - 5, y),
                 _bgr(95, 100, 105), 1)
    base = _add_sky(base)
    base = _add_grass_border(base)
    base = _add_color_temperature(base)
    base = _light_jitter(base)
    return _finalize(_persp(base))


def render_stage3():
    """Concrete slab freshly poured: bright grey with very fine surface grain,
    visible formwork around the perimeter, occasional rebar offcuts on top."""
    # Optional dirt surround.
    base = _texture_modulate((80, 100, 130), (H, W), intensity=15.0, sigma_scale=18.0)
    # Slab with very fine smooth texture (concrete is mostly uniform).
    pad = _ri(15, 35)
    slab_y0 = pad + _ri(15, 35)
    slab = _texture_modulate((178, 180, 178), (H - slab_y0 - pad, W - 2 * pad),
                             intensity=4.0, sigma_scale=3.0)
    # Subtle longer-wavelength stains/discolouration.
    stains = _multi_octave_noise((H - slab_y0 - pad, W - 2 * pad),
                                  octaves=3, persistence=0.6, sigma_scale=40.0)
    slab += np.repeat((stains * 6.0)[..., None], 3, axis=-1)
    base[slab_y0:H - pad, pad:W - pad] = slab
    # Wooden formwork (warm brown rectangle outline).
    cv2.rectangle(base, _pt(pad, slab_y0), _pt(W - pad, H - pad),
                  _bgr(_ri(70, 110), _ri(55, 85), _ri(40, 65)), 4)
    # Rebar grid fragment occasionally visible.
    if RNG.random() < 0.5:
        bx = _ri(pad + 5, W - pad - 80)
        by = _ri(slab_y0 + 10, H - pad - 70)
        for i in range(_ri(4, 9)):
            cv2.line(base, _pt(bx + i * 6, by), _pt(bx + i * 6, by + 55),
                     _bgr(_ri(110, 145), _ri(110, 145), _ri(110, 145)), 1)
        for j in range(_ri(2, 4)):
            cv2.line(base, _pt(bx, by + j * 15), _pt(bx + 50, by + j * 15),
                     _bgr(125, 125, 125), 1)
    # Wet-look glossy patches on cured concrete.
    if RNG.random() < 0.3:
        gx, gy = _ri(pad + 30, W - pad - 60), _ri(slab_y0 + 20, H - pad - 50)
        cv2.ellipse(base, _pt(gx, gy), _pt(_ri(20, 50), _ri(8, 18)),
                    _ri(0, 180), 0, 360, _bgr(195, 197, 198), -1)
    base = _add_sky(base, sky_h_frac=float(RNG.uniform(0.0, 0.18)))
    base = _add_color_temperature(base)
    base = _light_jitter(base)
    base = _cast_shadow(base)
    return _finalize(_persp(base))


def render_stage4():
    """Surface finishing: asphalt or coloured acrylic, with realistic grain."""
    color_choice = str(RNG.choice(["asphalt", "green", "blue", "red"]))
    if color_choice == "asphalt":
        center_bgr = (_ri(40, 55), _ri(40, 55), _ri(40, 55))
        intensity = 4.0          # asphalt has visible aggregate grain
        sigma = 2.0
    elif color_choice == "green":
        center_bgr = (_ri(55, 80), _ri(115, 145), _ri(55, 85))
        intensity = 3.0
        sigma = 4.0
    elif color_choice == "blue":
        center_bgr = (_ri(135, 165), _ri(80, 105), _ri(40, 65))
        intensity = 3.0
        sigma = 4.0
    else:  # red acrylic
        center_bgr = (_ri(50, 75), _ri(55, 80), _ri(140, 175))
        intensity = 3.0
        sigma = 4.0
    base = _texture_modulate(center_bgr, (H, W), intensity=intensity, sigma_scale=sigma)
    # Very subtle long-wavelength tint variation.
    tint = _multi_octave_noise((H, W), octaves=2, persistence=0.5, sigma_scale=60.0)
    base += np.repeat((tint * 3.0)[..., None], 3, axis=-1)
    base = _add_sky(base, sky_h_frac=float(RNG.uniform(0.0, 0.15)))
    base = _add_grass_border(base, frac=float(RNG.uniform(0.0, 0.12)))
    base = _add_color_temperature(base)
    base = _light_jitter(base)
    base = _cast_shadow(base)
    if RNG.random() < 0.15:
        base = _motion_blur(base, kernel_size=3)
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
