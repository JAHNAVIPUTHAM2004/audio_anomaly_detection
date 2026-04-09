# Audio Event Recognition (Flask + SQLite + Realtime Mic)

## 1) Put your model files in project root
- FINAL_audio_event_model.keras
- class_names.json

## 2) Install dependencies
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 3) IMPORTANT: Install ffmpeg (needed for Chrome mic chunks: webm/opus)
### Ubuntu / Colab
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```
### Windows
Install FFmpeg and add it to PATH, then reopen terminal.

## 4) Run
```bash
python app.py
```

Open: http://127.0.0.1:5000

## Realtime prediction
- Login
- Go to Prediction
- Start Listening
- Save to History
- Export CSV in Report
