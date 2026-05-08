"""Two-headed CNN: MobileNetV2 transfer-learning classifier + progress regressor.

  Input  : (224, 224, 3) RGB, scaled 0..1.
  Outputs (dict — explicit name-keyed, NOT a list):
    - 'stage'    softmax over 7 classes  (Sparse Categorical CrossEntropy).
    - 'progress' single sigmoid output in [0, 1] (MSE against progress/100).

The previous version of this module returned outputs as a list AND used a Lambda
layer to scale progress to [0, 100]. With Keras 3 and dict-keyed labels, that
combination silently routed labels through the wrong head — the symptom was
val_stage_loss → 0 with val_stage_acc < 1% (a collapsed model that always
predicts the same class with ~100% confidence). The fixes here:

  1. Outputs declared as a dict so label routing is unambiguous.
  2. Progress head outputs raw sigmoid in [0, 1]; preprocessing scales the
     label to [0, 1] too. Removes the Lambda wrapper.
  3. loss_weights rebalanced — with progress now in [0, 1], its MSE lives in
     a similar magnitude to stage CE, so equal weighting (1.0 + 0.5) actually
     trains both heads instead of letting one dominate.

MobileNetV2 chosen because the project trains on a CPU laptop:
  - ~3.5M params, ~14 MB on disk, fast on CPU TF.
  - ImageNet-pretrained features cover the textures we need
    (grass, concrete, metal, soil) at a fraction of the cost of larger backbones.
"""
from __future__ import annotations
import os
import tensorflow as tf
from tensorflow.keras import layers, models, applications, optimizers, losses, metrics
from .stages import NUM_CLASSES


def build_model(input_size: int = 224, base_trainable: bool = False) -> tf.keras.Model:
    inputs = layers.Input(shape=(input_size, input_size, 3), name="image")
    # Inputs are scaled 0..1 by preprocessing. MobileNetV2 expects -1..+1.
    x = layers.Rescaling(scale=2.0, offset=-1.0)(inputs)

    base = applications.MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_tensor=x,
        alpha=1.0,
    )
    base.trainable = base_trainable

    feat = layers.GlobalAveragePooling2D()(base.output)
    feat = layers.Dropout(0.3)(feat)

    cls = layers.Dense(192, activation="relu")(feat)
    cls = layers.Dropout(0.3)(cls)
    stage_out = layers.Dense(NUM_CLASSES, activation="softmax", name="stage")(cls)

    reg = layers.Dense(96, activation="relu")(feat)
    reg = layers.Dropout(0.2)(reg)
    progress_out = layers.Dense(1, activation="sigmoid", name="progress")(reg)

    model = models.Model(
        inputs=inputs,
        outputs={"stage": stage_out, "progress": progress_out},
        name="basketball_court_cnn",
    )
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss={
            "stage": losses.SparseCategoricalCrossentropy(),
            "progress": losses.MeanSquaredError(),
        },
        loss_weights={"stage": 1.0, "progress": 0.5},
        metrics={
            "stage": [metrics.SparseCategoricalAccuracy(name="acc")],
            "progress": [metrics.MeanAbsoluteError(name="mae")],
        },
    )
    return model


def save_model(model: tf.keras.Model, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    model.save(path)


def load_model(path: str) -> tf.keras.Model:
    """Build the architecture in code, then load weights from disk.

    Loading via load_weights (rather than tf.keras.models.load_model) sidesteps
    Keras 3's refusal to deserialise some custom layers from .h5 files. The
    architecture lives in this file and is the source of truth.
    """
    model = build_model(input_size=224, base_trainable=False)
    model.load_weights(path)
    return model
