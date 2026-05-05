"""Two-headed CNN: MobileNetV2 transfer-learning classifier + progress regressor.

  Input  : (224, 224, 3) RGB, scaled 0–1.
  Outputs:
    - 'stage' softmax over 7 classes (Sparse Categorical CrossEntropy).
    - 'progress' single sigmoid * 100 (MSE) — so the model can fine-tune progress
       within a stage (e.g., 28% inside the 25–45% Base-Layer band).

MobileNetV2 chosen over ResNet50 because:
  - ~3.5M params vs ~25M => ~7x faster on CPU TF.
  - ImageNet-pretrained features cover the same generic textures we need
    (grass, concrete, metal, soil) at a fraction of the cost.
  - Smaller .h5 (~14 MB vs ~100 MB) keeps the AI service container cheap to ship.
"""
from __future__ import annotations
import os
import tensorflow as tf
from tensorflow.keras import layers, models, applications, optimizers, losses, metrics
from .stages import NUM_CLASSES


def build_model(input_size: int = 224, base_trainable: bool = False) -> tf.keras.Model:
    inputs = layers.Input(shape=(input_size, input_size, 3), name="image")
    # Inputs are scaled 0..1 by preprocessing. MobileNetV2 expects -1..+1.
    x = layers.Lambda(lambda t: tf.keras.applications.mobilenet_v2.preprocess_input(t * 255.0))(inputs)

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
    reg = layers.Dense(1, activation="sigmoid")(reg)
    progress_out = layers.Lambda(lambda t: t * 100.0, name="progress")(reg)

    model = models.Model(inputs=inputs, outputs=[stage_out, progress_out], name="basketball_court_cnn")
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss={"stage": losses.SparseCategoricalCrossentropy(),
              "progress": losses.MeanSquaredError()},
        loss_weights={"stage": 1.0, "progress": 0.005},
        metrics={"stage": [metrics.SparseCategoricalAccuracy(name="acc")],
                 "progress": [metrics.MeanAbsoluteError(name="mae")]},
    )
    return model


def save_model(model: tf.keras.Model, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    model.save(path)


def load_model(path: str) -> tf.keras.Model:
    """Load weights into a freshly-built model.

    We build the architecture in code (which knows the Lambda functions) and
    then call load_weights — sidestepping Keras 3's lambda-deserialisation
    refusal that breaks tf.keras.models.load_model on .h5 files containing
    Lambda layers.
    """
    model = build_model(input_size=224, base_trainable=False)
    model.load_weights(path)
    return model
