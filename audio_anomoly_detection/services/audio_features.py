import io
import numpy as np
import librosa
import tensorflow as tf

def audio_to_img_from_samples(y: np.ndarray, sr: int, duration: float, n_mels: int, img_size: int) -> np.ndarray:
    """Convert mono waveform to MobileNetV2-preprocessed (img_size,img_size,3) float32."""
    target_len = int(sr * duration)
    if len(y) < target_len:
        y = np.pad(y, (0, target_len - len(y)))
    else:
        y = y[:target_len]

    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels, n_fft=2048, hop_length=512)
    S_db = librosa.power_to_db(S, ref=np.max)

    # normalize 0..1
    S_db = (S_db - S_db.min()) / (S_db.max() - S_db.min() + 1e-9)

    img = S_db.astype(np.float32)[..., np.newaxis]                  # (n_mels, T, 1)
    img = tf.image.resize(img, (img_size, img_size)).numpy()        # (img_size,img_size,1)
    img = np.repeat(img, 3, axis=-1)                                # (img_size,img_size,3)

    # MobileNetV2 preprocess (must match training)
    img = tf.keras.applications.mobilenet_v2.preprocess_input(img * 255.0)
    return img.astype(np.float32)

def decode_audio_bytes(audio_bytes: bytes, target_sr: int) -> np.ndarray:
    """Best-effort decoder. Supports WAV directly; for webm/ogg use pydub+ffmpeg in predictor.py."""
    import soundfile as sf
    data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = np.mean(data, axis=-1)
    if sr != target_sr:
        data = librosa.resample(data, orig_sr=sr, target_sr=target_sr)
    return data.astype(np.float32)
