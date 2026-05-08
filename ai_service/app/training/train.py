"""Train the basketball-court CNN.

CPU-friendly defaults: small batch, frozen MobileNetV2 backbone, 12 epochs with
EarlyStopping. On a typical laptop CPU each epoch takes ~10-30 minutes for
~3000 training images at 224x224, so a full run fits comfortably overnight.

Usage (from repo root or inside the ai_service container):
    python -m app.training.train \\
        --data data \\
        --output models/basketball_court_cnn.h5 \\
        --epochs 12 --batch 16
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import tensorflow as tf

from ..model_arch import build_model, save_model
from ..stages import NUM_CLASSES
from .dataset import build_datasets


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="root dir holding train/val/test subdirs")
    ap.add_argument("--output", required=True, help="output .h5 path")
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch", type=int, default=16,
                    help="batch size — keep small on CPU to avoid memory pressure")
    ap.add_argument("--input-size", type=int, default=224)
    ap.add_argument("--unfreeze", action="store_true",
                    help="unfreeze MobileNetV2 base for fine-tuning. Adds 3-5x training time on CPU.")
    return ap.parse_args()


def main():
    args = parse_args()
    print(f"[train] tensorflow {tf.__version__}, devices: {tf.config.list_physical_devices()}")
    print(f"[train] loading data from {args.data}")
    datasets = build_datasets(args.data, args.input_size, args.batch)
    if "train" not in datasets:
        raise SystemExit("no train split found — run `python -m app.training.prepare_data` first.")

    print(f"[train] building model (input_size={args.input_size}, unfreeze={args.unfreeze})")
    model = build_model(args.input_size, base_trainable=args.unfreeze)
    model.summary(print_fn=lambda s: print("  " + s))

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=4, restore_best_weights=True, verbose=1,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=2, min_lr=1e-5, verbose=1,
        ),
        tf.keras.callbacks.ModelCheckpoint(
            # Keras 3 requires the .weights.h5 suffix when save_weights_only=True.
            filepath=str(Path(args.output).with_suffix("")) + ".best.weights.h5",
            monitor="val_stage_acc", mode="max",
            save_best_only=True, save_weights_only=True, verbose=1,
        ),
    ]

    history = model.fit(
        datasets["train"],
        validation_data=datasets.get("val"),
        epochs=args.epochs,
        callbacks=callbacks,
        verbose=1,
    )

    save_model(model, args.output)

    metrics_out: dict = {}
    if "test" in datasets:
        print("[train] evaluating on test split...")
        eval_results = model.evaluate(datasets["test"], return_dict=True)
        metrics_out["test"] = eval_results

    metadata = {
        "input_size": args.input_size,
        "epochs": args.epochs,
        "batch": args.batch,
        "unfreeze": args.unfreeze,
        "history": {k: [float(v) for v in vals] for k, vals in history.history.items()},
        "metrics": metrics_out,
    }
    meta_path = Path(args.output).with_suffix(".meta.json")
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    # Loud warning if training collapsed — protects against a repeat of the
    # earlier broken-model incident that shipped to production.
    best_val_acc = max(history.history.get("val_stage_acc", [0.0]))
    if best_val_acc < 1.0 / NUM_CLASSES:
        print(f"\n  WARNING: best val_stage_acc = {best_val_acc:.3f} is at or below "
              f"random baseline ({1.0/NUM_CLASSES:.3f}). The runtime predictor will "
              f"refuse this checkpoint and use the heuristic fallback.")

    print(f"\n[train] saved model to {args.output}")
    print(f"[train] saved metadata to {meta_path}")
    print(f"[train] best val_stage_acc: {best_val_acc:.3f}")


if __name__ == "__main__":
    main()
