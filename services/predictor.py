import os
import json
import numpy as np
import tensorflow as tf

from tensorflow.keras.models import load_model
from .audio_features import audio_to_img_from_samples, decode_audio_bytes


class AudioEventPredictor:
    def __init__(
        self,
        model_path: str,
        class_names_path: str,
        sr: int,
        duration: float,
        n_mels: int,
        img_size: int,
        upload_dir: str,
    ):
        self.model_path = model_path
        self.class_names_path = class_names_path
        self.sr = sr
        self.duration = duration
        self.n_mels = n_mels
        self.img_size = img_size
        self.upload_dir = upload_dir

        self.model = None
        self.class_names = None

    def load(self):
        
        if self.model is None:
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(
                    f"Model not found at {self.model_path}. Put FINAL_audio_event_model.keras in project root."
                )

            try:
                self.model = load_model(
                    self.model_path,
                    compile=False,
                    safe_mode=False
                )
                print(" Predictor model loaded successfully")
            except Exception as e:
                print(" Predictor model loading failed:", e)
                raise e

        
        if self.class_names is None:
            if not os.path.exists(self.class_names_path):
                raise FileNotFoundError(
                    f"class_names.json not found at {self.class_names_path}. Put class_names.json in project root."
                )
            with open(self.class_names_path, "r", encoding="utf-8") as f:
                self.class_names = json.load(f)

        return self

    def _bytes_to_waveform(self, audio_bytes: bytes, mimetype: str | None) -> np.ndarray:
        try:
            y = decode_audio_bytes(audio_bytes, self.sr)
        except Exception as e:
            raise RuntimeError(
                "Audio decoding failed. Ensure frontend sends WAV (audio/wav)."
            ) from e

        y = np.asarray(y, dtype=np.float32)
        if y.ndim > 1:
            y = np.mean(y, axis=-1).astype(np.float32)

        return y

    def predict_chunk(self, audio_bytes: bytes, mimetype: str | None = None) -> dict:
        self.load()

        y = self._bytes_to_waveform(audio_bytes, mimetype)

        img = audio_to_img_from_samples(
            y,
            sr=self.sr,
            duration=self.duration,
            n_mels=self.n_mels,
            img_size=self.img_size,
        )

        x = np.expand_dims(img, axis=0)

        probs = self.model.predict(x, verbose=0)[0].astype(float)
        top_idx = int(np.argmax(probs))

        pred = self.class_names[top_idx]
        conf = float(probs[top_idx])

        top3_idx = np.argsort(probs)[::-1][:3]
        top3 = [
            {"label": self.class_names[int(i)], "confidence": float(probs[int(i)])}
            for i in top3_idx
        ]

        return {
            "predicted_class": pred,
            "confidence": conf,
            "top3": top3,
            "probs": [float(p) for p in probs],
        }