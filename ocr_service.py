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

def box_area(box: list | np.ndarray) -> float:
    """Return the area of a quadrilateral text box.

    PaddleOCR can sometimes return malformed or rotated boxes which lead to
    zero areas if directly passed to :func:`cv2.contourArea`. To make the area
    computation more robust we first attempt the polygon area and then fall
    back to the bounding rectangle area whenever the polygon area is zero.
    """

    if box is None:
        return 0.0

    pts = np.asarray(box, dtype=np.float32).reshape(-1, 2)
    if pts.shape[0] < 3:
        return 0.0

    area = float(cv2.contourArea(pts))
    if area == 0.0:
        x, y, w, h = cv2.boundingRect(pts)
        area = float(w * h)

    return area

def find_largest_text_group(lines: list[dict], dist_ratio: float = 1.5) -> dict | None:
    """Cluster lines that are vertically close into multi-line groups.

    The previous implementation clustered by fixed pixel distance which often
    failed when large fonts produced spacing greater than the threshold. This
    version scales the distance by the average line height so that headings like
    ``"Glen"`` and ``"20"`` are merged even if they are spaced further apart than
    smaller text.
    """

    def box_stats(box: np.ndarray) -> tuple[np.ndarray, float]:
        pts = box.reshape(-1, 2).astype(float)
        center = pts.mean(axis=0)
        height = pts[:, 1].max() - pts[:, 1].min()
        return center, height

    clusters: list[dict] = []
    for line in lines:
        box = np.asarray(line.get("box"), dtype=float)
        if box.size == 0:
            continue
        center, height = box_stats(box)
        placed = False
        for cl in clusters:
            if np.linalg.norm(center - cl["center"]) <= dist_ratio * max(height, cl["avg_height"]):
                cl["lines"].append(line)
                cl["boxes"].append(box)
                cl["center"], cl["avg_height"] = box_stats(np.vstack(cl["boxes"]))
                placed = True
                break
        if not placed:
            clusters.append({"lines": [line], "boxes": [box], "center": center, "avg_height": height})

    best = None
    for cl in clusters:
        pts = np.vstack([b.reshape(-1, 2) for b in cl["boxes"]])
        x_min, y_min = pts.min(axis=0)
        x_max, y_max = pts.max(axis=0)
        area = float((x_max - x_min) * (y_max - y_min))
        ordered = sorted(
            cl["lines"], key=lambda l: np.min(np.asarray(l["box"], dtype=float)[:, 1])
        )
        text = " ".join(l["text"] for l in ordered)
        conf = float(np.mean([l["confidence"] for l in cl["lines"]]))
        result = {
            "text": text,
            "confidence": conf,
            "box": [
                [float(x_min), float(y_min)],
                [float(x_max), float(y_min)],
                [float(x_max), float(y_max)],
                [float(x_min), float(y_max)],
            ],
            "area": area,
        }
        if best is None or area > best["area"]:
            best = result

    return best

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
                    # Flatten and reshape to pairs to avoid iterable errors
                    'box': np.asarray(box, dtype=float).reshape(-1, 2).tolist(),
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
                    # Flatten and reshape to pairs to avoid iterable errors
                    'box': np.asarray(box, dtype=float).reshape(-1, 2).tolist(),
                    'area': area
                }
                lines.append(entry)
                full_text.append(txt)
                if area > max_area:
                    max_area = area
                    largest_line = entry

    largest_group = find_largest_text_group(lines)

    print("Returning results.")
    return jsonify({
        'lines': lines,
        'text': '\n'.join(full_text),
        'largest_line': largest_group or largest_line
    })


if __name__ == '__main__':
    app.run(port=5001, debug=True)
