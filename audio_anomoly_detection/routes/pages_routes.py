import json
from collections import Counter
from flask import Blueprint, render_template, send_file, Response
from flask_login import login_required, current_user

from models.prediction import Prediction

pages_bp = Blueprint("pages", __name__, url_prefix="")

@pages_bp.get("/")
def root():
    return render_template("pages/home.html")

@pages_bp.get("/home")
def home():
    return render_template("pages/home.html")



@pages_bp.get("/prediction")
@login_required
def prediction():
    return render_template("pages/prediction.html")

@pages_bp.get("/history")
@login_required
def history():
    rows = (Prediction.query
            .filter_by(user_id=current_user.id)
            .order_by(Prediction.created_at.desc())
            .limit(500)
            .all())
    return render_template("pages/history.html", rows=rows)

@pages_bp.get("/report")
@login_required
def report():
    rows = (Prediction.query
            .filter_by(user_id=current_user.id)
            .order_by(Prediction.created_at.desc())
            .all())
    counts = Counter([r.predicted_class for r in rows])
    total = len(rows)
    return render_template("pages/report.html", total=total, counts=dict(counts), rows=rows)

@pages_bp.get("/report.csv")
@login_required
def report_csv():
    rows = (Prediction.query
            .filter_by(user_id=current_user.id)
            .order_by(Prediction.created_at.desc())
            .all())

    def gen():
        yield "timestamp,predicted_class,confidence\n"
        for r in rows:
            ts = r.created_at.isoformat()
            yield f"{ts},{r.predicted_class},{r.confidence:.6f}\n"

    return Response(gen(), mimetype="text/csv", headers={
        "Content-Disposition": "attachment; filename=audio_event_report.csv"
    })
