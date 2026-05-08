"""Dataset loader for stage classification.

Expected layout:
  data/
    train/
      stage_1/*.{jpg,png,jpeg,webp}
      ...
      stage_7/*.{...}
    val/...
    test/...

Each filename may optionally encode the exact progress percentage as a suffix
("_p35.jpg" -> 35.0). If absent, we use the stage midpoint.

The training split applies aggressive augmentation (rotation, zoom, contrast,
brightness, hue jitter, horizontal flip, gaussian noise) so the model
generalises beyond the synthetic distribution towards real photos.
"""
from __future__ import annotations
import re
from pathlib import Path
import tensorflow as tf
import numpy as np

from ..stages import NUM_CLASSES, stage_midpoint


PROGRESS_RE = re.compile(r"_p(\d+(?:\.\d+)?)")


def _extract_progress(stem: str, default: float) -> float:
    m = PROGRESS_RE.search(stem)
    return float(m.group(1)) if m else default


def _load_split(split_dir: Path, input_size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Load (images, class_indices, progress_in_[0,1]).

    Progress labels are normalised to [0, 1] to match the model's sigmoid head —
    the previous version kept them in [0, 100] and used a Lambda*100 wrapper on
    the output, which interacted badly with Keras 3 dict-output routing.
    """
    images, classes, progresses = [], [], []
    for cls_idx in range(NUM_CLASSES):
        cls_dir = split_dir / f"stage_{cls_idx + 1}"
        if not cls_dir.exists():
            continue
        midpoint = stage_midpoint(cls_idx)
        for img_path in sorted(cls_dir.glob("*")):
            if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            img = tf.io.read_file(str(img_path))
            img = tf.io.decode_image(img, channels=3, expand_animations=False)
            img = tf.image.resize(img, [input_size, input_size])
            img = tf.cast(img, tf.float32) / 255.0
            images.append(img.numpy())
            classes.append(cls_idx)
            progresses.append(_extract_progress(img_path.stem, midpoint) / 100.0)
    if not images:
        raise FileNotFoundError(f"No images found under {split_dir}")
    return (
        np.array(images, dtype=np.float32),
        np.array(classes, dtype=np.int32),
        np.array(progresses, dtype=np.float32),
    )


def _augment(image, labels):
    """Strong augmentation. Each transform is applied independently with TF ops
    so the input pipeline stays vectorisable."""
    image = tf.image.random_flip_left_right(image)
    image = tf.image.random_brightness(image, max_delta=0.25)
    image = tf.image.random_contrast(image, lower=0.7, upper=1.3)
    image = tf.image.random_saturation(image, lower=0.7, upper=1.3)
    image = tf.image.random_hue(image, max_delta=0.04)
    # Gaussian noise — robust to sensor noise / camera diversity.
    noise = tf.random.normal(tf.shape(image), mean=0.0, stddev=0.02)
    image = tf.clip_by_value(image + noise, 0.0, 1.0)
    return image, labels


def build_datasets(data_root: str, input_size: int = 224, batch_size: int = 32) -> dict[str, tf.data.Dataset]:
    root = Path(data_root)
    out: dict[str, tf.data.Dataset] = {}
    for split in ("train", "val", "test"):
        sd = root / split
        if not sd.exists():
            continue
        x, y, p = _load_split(sd, input_size)
        ds = tf.data.Dataset.from_tensor_slices((x, {"stage": y, "progress": p}))
        if split == "train":
            ds = ds.shuffle(buffer_size=min(2000, len(x)), reshuffle_each_iteration=True)
            ds = ds.map(_augment, num_parallel_calls=tf.data.AUTOTUNE)
        ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
        out[split] = ds
    return out
