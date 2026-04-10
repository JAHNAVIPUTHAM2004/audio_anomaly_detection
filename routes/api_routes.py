import json
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db
from models.prediction import Prediction
from services.predictor import AudioEventPredictor
from flask import current_app

api_bp = Blueprint("api", __name__, url_prefix="/api")

def get_predictor() -> AudioEventPredictor:
    cfg = current_app.config
    pred = AudioEventPredictor(
        model_path=cfg["MODEL_PATH"],
        class_names_path=cfg["CLASS_NAMES_PATH"],
        sr=cfg["SR"],
        duration=cfg["DURATION"],
        n_mels=cfg["N_MELS"],
        img_size=cfg["IMG_SIZE"],
        upload_dir=cfg["UPLOAD_DIR"],
    )
    return pred

@api_bp.post("/predict-chunk")
@login_required
def predict_chunk():
    
    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "Missing audio file field 'audio'"}), 400

    f = request.files["audio"]
    audio_bytes = f.read()
    mimetype = f.mimetype or request.headers.get("Content-Type")

    try:
        result = get_predictor().predict_chunk(audio_bytes, mimetype=mimetype)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@api_bp.post("/save-event")
@login_required
def save_event():
    data = request.get_json(silent=True) or {}
    label = data.get("predicted_class")
    conf = data.get("confidence")
    probs = data.get("probs")

    if not label or conf is None:
        return jsonify({"ok": False, "error": "predicted_class and confidence are required"}), 400

    row = Prediction(
        user_id=current_user.id,
        predicted_class=str(label),
        confidence=float(conf),
        scores_json=json.dumps(probs) if probs is not None else None
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "id": row.id})

@api_bp.post("/predict-file")
@login_required
def predict_file():
    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "Missing audio file field 'audio'"}), 400

    f = request.files["audio"]
    audio_bytes = f.read()
    mimetype = f.mimetype or request.headers.get("Content-Type")

    try:
        result = get_predictor().predict_chunk(audio_bytes, mimetype=mimetype)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500