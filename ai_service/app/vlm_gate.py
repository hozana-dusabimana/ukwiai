"""OpenRouter vision-language relevance gate + stage analysis.

The pixel heuristic and OWLv2 are closed-set detectors: they answer "does this
contain a court structure?" and therefore misclassify open-set inputs — a road,
a wall, skin or food read as "asphalt / painted court" and slip through the gate.
A VLM answers the open-set question directly ("is this a basketball court or a
basketball-court construction site, yes or no?"), which is exactly what rejects
the non-court photos the other layers cannot.

This module is BEST-EFFORT and FAIL-OPEN: any missing key, network error,
timeout or malformed reply returns ``available=False`` so the predictor silently
falls back to the existing heuristic / OWLv2 / CNN path. It never raises.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai-vlm")

_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

# 7-stage rubric handed to the model so its stage index lines up with stages.py.
_STAGE_RUBRIC = (
    "1 = Site Clearing & Excavation: bare cleared ground, topsoil stripped, "
    "machinery, spoil piles, an empty rectangular plot being prepared.\n"
    "2 = Sub-base Preparation: gravel / hardcore / compacted aggregate layer "
    "spread over the plot, no concrete yet.\n"
    "3 = Base Layer / Concrete Slab: poured or curing concrete rectangle, "
    "formwork, visible rebar, grey slab.\n"
    "4 = Surface Finishing (Asphalt/Acrylic): smooth black asphalt or a coloured "
    "acrylic surface laid, but NO painted lines yet.\n"
    "5 = Court Line Marking & Painting: coloured court with white boundary / key "
    "/ three-point lines being or already painted.\n"
    "6 = Hoops & Backboards Installation: basketball poles, backboards, rims or "
    "nets standing on a finished court.\n"
    "7 = Fencing & Final Touches: perimeter chain-link fence, lighting, benches "
    "around a complete court."
)

_SYSTEM_PROMPT = (
    "You are a strict image-relevance gate for an app that tracks the "
    "construction of OUTDOOR BASKETBALL COURTS through 7 stages. You look at one "
    "photo and decide (a) whether it is court-related at all, and (b) if so, "
    "which construction stage it shows.\n\n"
    "The 7 stages:\n" + _STAGE_RUBRIC + "\n\n"
    "ACCEPT (is_court_related=true) when the photo plausibly shows a basketball "
    "court OR any stage of building one — including early earthworks that look "
    "like a bare/gravel/concrete rectangular plot in an outdoor construction "
    "context. Other hard sports courts under construction (tennis, volleyball, "
    "futsal) are also court_related=true; set scene='other_sports_court' and let "
    "the backend disambiguate by size.\n\n"
    "REJECT (is_court_related=false, scene='unrelated') when the photo clearly "
    "shows something else: a person / portrait / selfie, food, a document / "
    "screenshot / screen, an indoor room, an animal, a vehicle, a product "
    "close-up, a random building facade, or a nature scene with no construction. "
    "When in genuine doubt about an outdoor ground/earthworks scene, lean ACCEPT; "
    "when the subject is obviously a person/food/indoor/etc., REJECT.\n\n"
    "Respond with ONLY a JSON object, no prose, no code fences:\n"
    "{\"is_court_related\": bool, \"scene\": \"finished_court\" | "
    "\"court_under_construction\" | \"other_sports_court\" | \"unrelated\", "
    "\"stage\": <1-7 or null>, \"progress_percent\": <0-100 or null>, "
    "\"confidence\": <0.0-1.0>, \"reason\": \"<one short sentence>\"}\n"
    "stage/progress_percent must be null when is_court_related is false."
)


@dataclass
class VlmResult:
    available: bool = False
    is_court_related: bool | None = None
    scene: str | None = None
    stage: int | None = None
    progress_percent: float | None = None
    confidence: float | None = None
    reason: str | None = None
    model: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def _enabled() -> bool:
    flag = os.environ.get("AI_ENABLE_VLM", "").strip().lower()
    if flag in ("0", "false", "no"):
        return False
    # Default ON whenever a key is present; explicit "1/true/yes" also forces on.
    return bool(os.environ.get("OPENROUTER_API_KEY", "").strip())


def _data_url(image_bytes: bytes) -> str:
    mime = "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        mime = "image/webp"
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _parse_content(content: str) -> dict[str, Any]:
    """Extract the JSON object from the model reply, tolerating code fences."""
    text = content.strip()
    if text.startswith("```"):
        # ```json ... ``` or ``` ... ```
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def classify(image_bytes: bytes) -> VlmResult:
    """Ask the OpenRouter VLM whether the image is a basketball court / build and
    which stage it shows. Never raises — returns available=False on any failure."""
    if not _enabled():
        return VlmResult(available=False)

    api_key = os.environ["OPENROUTER_API_KEY"].strip()
    model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash").strip()
    timeout = float(os.environ.get("OPENROUTER_TIMEOUT", "30"))

    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 300,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Classify this construction progress photo.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": _data_url(image_bytes)},
                    },
                ],
            },
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        _ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # OpenRouter attribution headers (optional but recommended).
            "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "https://ukwiai.isiri.rw"),
            "X-Title": "UKWI AI court relevance gate",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_content(content)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        logger.warning("VLM gate HTTP %s: %s", exc.code, detail)
        return VlmResult(available=False)
    except Exception as exc:  # network, timeout, JSON, key-path — all fail-open
        logger.warning("VLM gate unavailable (%s)", exc)
        return VlmResult(available=False)

    is_court = parsed.get("is_court_related")
    if not isinstance(is_court, bool):
        logger.warning("VLM gate returned no boolean is_court_related: %r", parsed)
        return VlmResult(available=False)

    stage = parsed.get("stage")
    stage = int(stage) if isinstance(stage, (int, float)) and 1 <= stage <= 7 else None
    prog = parsed.get("progress_percent")
    prog = float(prog) if isinstance(prog, (int, float)) else None
    conf = parsed.get("confidence")
    conf = float(conf) if isinstance(conf, (int, float)) else None

    return VlmResult(
        available=True,
        is_court_related=is_court,
        scene=parsed.get("scene"),
        stage=stage,
        progress_percent=prog,
        confidence=conf,
        reason=parsed.get("reason"),
        model=model,
        raw=parsed,
    )
