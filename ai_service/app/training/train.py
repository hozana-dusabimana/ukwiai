"""Train the basketball-court CNN.

Usage (inside the ai_service container):
    python -m app.training.train --data /app/data --epochs 30 --batch 32 \
        --output /app/models/basketball_court_cnn.h5
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import tensorflow as tf

from ..model_arch import build_model, save_model
from .dataset import build_datasets


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="root dir holding train/val/test subdirs")
    ap.add_argument("--output", required=True, help="output .h5 path")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--input-size", type=int, default=224)
    ap.add_argument("--unfreeze", action="store_true", help="unfreeze base for fine-tuning")
    return ap.parse_args()


def main():
    args = parse_args()
    datasets = build_datasets(args.data, args.input_size, args.batch)
    if "train" not in datasets:
        raise SystemExit("no train split found")

    model = build_model(args.input_size, base_trainable=args.unfreeze)
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3),
    ]

    history = model.fit(
        datasets["train"],
        validation_data=datasets.get("val"),
        epochs=args.epochs,
        callbacks=callbacks,
    )

    save_model(model, args.output)

    # Evaluate
    metrics_out: dict = {}
    if "test" in datasets:
        eval_results = model.evaluate(datasets["test"], return_dict=True)
        metrics_out["test"] = eval_results

    metadata = {
        "input_size": args.input_size,
        "epochs": args.epochs,
        "batch": args.batch,
        "history": {k: [float(v) for v in vals] for k, vals in history.history.items()},
        "metrics": metrics_out,
    }
    meta_path = Path(args.output).with_suffix(".meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model to {args.output}")
    print(f"Saved metadata to {meta_path}")


if __name__ == "__main__":
    main()
