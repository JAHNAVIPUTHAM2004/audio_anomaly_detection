import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-please")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(INSTANCE_DIR, "app.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Model files (place these in project root)
    MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(BASE_DIR, "FINAL_audio_event_model.keras"))
    CLASS_NAMES_PATH = os.environ.get("CLASS_NAMES_PATH", os.path.join(BASE_DIR, "class_names.json"))

    # Audio chunk storage
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(BASE_DIR, "static", "uploads", "chunks"))
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Audio + feature params (match training)
    SR = int(os.environ.get("SR", "22050"))
    DURATION = float(os.environ.get("DURATION", "4"))
    N_MELS = int(os.environ.get("N_MELS", "128"))
    IMG_SIZE = int(os.environ.get("IMG_SIZE", "224"))
