import numpy as np
from tensorflow.keras.models import load_model
from sklearn.metrics import accuracy_score, classification_report

# 🔹 Load model (CHANGE THIS PATH IF NEEDED)
model = load_model("FINAL_audio_event_model.h5")  # or .keras

# 🔹 Load data
X_val = np.load("X_val.npy")
y_val = np.load("y_val.npy")

# 🔹 Predict
y_pred = model.predict(X_val)
y_pred_classes = np.argmax(y_pred, axis=1)

# 🔹 Convert labels if needed
if len(y_val.shape) > 1:
    y_val = np.argmax(y_val, axis=1)

# 🔹 Accuracy
accuracy = accuracy_score(y_val, y_pred_classes)
print("Accuracy:", accuracy)

# 🔹 Report
print("\nClassification Report:\n")
print(classification_report(y_val, y_pred_classes))