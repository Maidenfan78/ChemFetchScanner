from flask import Flask, request, jsonify
import cv2
import numpy as np
from paddleocr import PaddleOCR
import os

app = Flask(__name__)
# Initialize once for efficiency (set lang to 'en' or another if needed)
# Suppress Paddle's attempt to write logs to /proc/self/io on some systems
os.environ.setdefault("FLAGS_log_dir", "/tmp")

try:
    ocr_model = PaddleOCR(use_textline_orientation=True, lang='en')
except Exception as e:
    raise RuntimeError(
        "Failed to initialize PaddleOCR. Ensure paddlex with OCR extras is installed." 
        f"\nOriginal error: {e}"
    )

def box_area(box):
    """Return the area of a quadrilateral box."""
    pts = np.array(box, dtype="float32")
    return float(cv2.contourArea(pts))

def preprocess_image(img_bytes):
    npimg = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image decoding failed! Is the uploaded file a valid image?")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.medianBlur(gray, 3)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(denoised)
    thresh = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 15
    )
    coords = np.column_stack(np.where(thresh > 0))
    if coords.size > 0:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        (h, w) = thresh.shape
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        deskewed = cv2.warpAffine(thresh, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    else:
        # Not enough data to determine rotation
        deskewed = thresh
    # Convert back to 3-channel for PaddleOCR (expects color)
    processed = cv2.cvtColor(deskewed, cv2.COLOR_GRAY2BGR)
    return processed

@app.route('/ocr', methods=['POST'])
def ocr():
    print("Request received at /ocr")
    if 'image' not in request.files:
        print("No image uploaded")
        return jsonify({'error': 'No image uploaded'}), 400
    img_file = request.files['image']
    img_bytes = img_file.read()

    try:
        print("Preprocessing image...")
        processed = preprocess_image(img_bytes)
        print("Image preprocessed.")
    except Exception as e:
        print(f"Image processing failed: {e}")
        return jsonify({'error': f'Image processing failed: {e}'}), 400

    try:
        print("Running OCR...")
        try:
            result = ocr_model.ocr(processed, cls=True)
        except TypeError:
            # For newer PaddleOCR versions where `cls` is unsupported
            result = ocr_model.ocr(processed)
        print("OCR complete.")
        print("PaddleOCR result:", result)
    except Exception as e:
        print(f"OCR failed: {e}")
        return jsonify({'error': f'OCR failed: {e}'}), 500

    lines = []
    full_text = []
    largest_line = None
    max_area = -1.0

    for line in result:
        if isinstance(line, dict):
            boxes = line.get('rec_boxes')
            if boxes is None or len(boxes) == 0:
                boxes = line.get('boxes', [])
            texts = line.get('rec_texts', [])
            scores = line.get('rec_scores', [])
            for box, txt, conf in zip(boxes, texts, scores):
                area = box_area(box)
                entry = {
                    'text': txt,
                    'confidence': float(conf),
                    'box': [list(map(float, pt)) for pt in box],
                    'area': area
                }
                lines.append(entry)
                full_text.append(txt)
                if area > max_area:
                    max_area = area
                    largest_line = entry
        elif isinstance(line, (list, tuple)) and len(line) >= 2:
            box = line[0]
            text_info = line[1]
            if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                txt, conf = text_info[0], text_info[1]
                area = box_area(box)
                entry = {
                    'text': txt,
                    'confidence': float(conf),
                    'box': [list(map(float, pt)) for pt in box],
                    'area': area
                }
                lines.append(entry)
                full_text.append(txt)
                if area > max_area:
                    max_area = area
                    largest_line = entry

    print("Returning results.")
    return jsonify({
        'lines': lines,
        'text': '\n'.join(full_text),
        'largest_line': largest_line
    })


if __name__ == '__main__':
    app.run(port=5001, debug=True)
