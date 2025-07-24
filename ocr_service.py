from flask import Flask, request, jsonify
import cv2
import numpy as np
from paddleocr import PaddleOCR
import os
from typing import List, Dict, Any, Tuple

app = Flask(__name__)
os.environ.setdefault("FLAGS_log_dir", "/tmp")

# Initialize PaddleOCR with angle classification
try:
    ocr_model = PaddleOCR(use_textline_orientation=True, lang='en')
except Exception as e:
    raise RuntimeError(
        "Failed to initialize PaddleOCR. Ensure paddlex with OCR extras is installed."
        f"\nOriginal error: {e}"
    )

# ---------- Geometry helpers --------------------------------------------------

def box_area(box: list | np.ndarray) -> float:
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


def box_stats(box: np.ndarray) -> Tuple[np.ndarray, float, float]:
    """Return (center, height, width) of a quadrilateral."""
    pts = box.reshape(-1, 2).astype(float)
    center = pts.mean(axis=0)
    h = pts[:, 1].max() - pts[:, 1].min()
    w = pts[:, 0].max() - pts[:, 0].min()
    return center, h, w

# ---------- Scoring & clustering ----------------------------------------------

def cluster_lines(lines: List[Dict[str, Any]], dist_ratio: float = 1.6) -> List[Dict[str, Any]]:
    """
    Cluster lines that belong together vertically.
    dist_ratio is multiplied by the max of the two line heights so big fonts
    can be spaced further apart and still join.
    """
    clusters: List[Dict[str, Any]] = []

    for line in lines:
        box = np.asarray(line["box"], dtype=float)
        center, height, _ = box_stats(box)
        placed = False
        for cl in clusters:
            if np.linalg.norm(center - cl["center"]) <= dist_ratio * max(height, cl["avg_height"]):
                cl["lines"].append(line)
                cl["boxes"].append(box)
                pts = np.vstack(cl["boxes"]).reshape(-1, 2)
                cl["center"] = pts.mean(axis=0)
                cl["avg_height"] = float(np.median([ln["height"] for ln in cl["lines"]]))
                placed = True
                break
        if not placed:
            clusters.append({
                "lines": [line],
                "boxes": [box],
                "center": center,
                "avg_height": float(height)
            })
    return clusters


def score_cluster(cluster: Dict[str, Any], global_med_height: float) -> float:
    """Return a score for the cluster based on total area, confidence, and height."""
    # Use sum of individual line areas instead of union box area
    total_area = sum(l['area'] for l in cluster["lines"])
    
    mean_conf = float(np.mean([l["confidence"] for l in cluster["lines"]]))
    med_height = float(np.median([l["height"] for l in cluster["lines"]]))
    
    # Boost larger text more aggressively
    height_boost = (med_height / (global_med_height + 1e-6)) ** 1.5
    return total_area * mean_conf * height_boost


def pick_predominant(
    lines: List[Dict[str, Any]],
    min_conf: float = 0.6,
    height_quantile: float = 0.50  # Increased to 0.50 for stricter filtering
) -> Dict[str, Any] | None:
    if not lines:
        return None

    # Compute per-line features
    for l in lines:
        box = np.asarray(l["box"], dtype=float)
        _, h, w = box_stats(box)
        l["height"] = float(h)
        l["width"] = float(w)
        l["area"] = box_area(box)

    # Filter by confidence
    filtered = [l for l in lines if l["confidence"] >= min_conf]
    if not filtered:
        filtered = lines

    # Check for a significantly large individual line
    heights = [l["height"] for l in filtered]
    if heights:
        max_height_line = max(filtered, key=lambda l: l["height"])
        height_ratio = max_height_line["height"] / np.median(heights)
        if height_ratio > 1.5:  # Select if 1.5x larger than median height
            return {
                "text": max_height_line["text"],
                "confidence": max_height_line["confidence"],
                "box": max_height_line["box"],
                "area": max_height_line["area"],
                "score": max_height_line["height"] * max_height_line["confidence"]
            }

    # Filter out smaller fonts
    h_cut = np.quantile(heights, height_quantile) if heights else 0.0
    filtered = [l for l in filtered if l["height"] >= h_cut]

    # Cluster and score
    clusters = cluster_lines(filtered, dist_ratio=1.2)  # Reduced to 1.2
    if not clusters:
        return max(filtered, key=lambda l: l["height"] * l["confidence"]) if filtered else None

    global_med_height = float(np.median([l["height"] for l in filtered]))

    best = None
    best_score = -1.0
    for cl in clusters:
        score = score_cluster(cl, global_med_height)
        if score > best_score:
            best_score = score
            best = cl

    if best is None:
        return None

    # Assemble final result
    ordered = sorted(best["lines"], key=lambda l: np.min(np.asarray(l["box"])[:, 1]))
    text = " ".join(l["text"] for l in ordered)
    pts = np.vstack([np.asarray(b).reshape(-1, 2) for b in best["boxes"]])
    x_min, y_min = pts.min(axis=0)
    x_max, y_max = pts.max(axis=0)
    return {
        "text": text,
        "confidence": float(np.mean([l["confidence"] for l in ordered])),
        "box": [
            [float(x_min), float(y_min)],
            [float(x_max), float(y_min)],
            [float(x_max), float(y_max)],
            [float(x_min), float(y_max)],
        ],
        "area": float((x_max - x_min) * (y_max - y_min)),
        "score": best_score
    }

# ---------- Preprocessing -----------------------------------------------------

def preprocess_image(img_bytes: bytes) -> np.ndarray:
    npimg = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image decoding failed! Is the uploaded file a valid image?")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.medianBlur(gray, 3)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    thresh = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 15
    )

    coords = np.column_stack(np.where(thresh > 0))
    if coords.size > 0:
        angle = cv2.minAreaRect(coords)[-1]
        angle = -(90 + angle) if angle < -45 else -angle
        h, w = thresh.shape
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        deskewed = cv2.warpAffine(
            thresh, M, (w, h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
    else:
        deskewed = thresh

    return cv2.cvtColor(deskewed, cv2.COLOR_GRAY2BGR)

# ---------- API ---------------------------------------------------------------
@app.route('/ocr', methods=['POST'])
def ocr():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    img_bytes = request.files['image'].read()
    debug_mode = request.args.get("mode") == "debug"

    # Preprocess image
    try:
        processed = preprocess_image(img_bytes)
    except Exception as e:
        return jsonify({'error': f'Image processing failed: {e}'}), 400

    # OCR call with version-safe logic
    try:
        try:
            if hasattr(ocr_model, "predict"):
                # Newer API: predict() without cls
                result = ocr_model.predict(processed)
            else:
                # Older API: ocr() with cls
                result = ocr_model.ocr(processed, cls=True)
        except TypeError:
            # Fallback to ocr() in case predict() signature didn't match
            result = ocr_model.ocr(processed, cls=True)

        lines: List[Dict[str, Any]] = []
        full_text: List[str] = []

        def _area_of(box):
            pts = np.asarray(box, dtype=np.float32).reshape(-1, 2)
            if pts.shape[0] < 3:
                x, y, w, h = cv2.boundingRect(pts.astype(np.int32))
                return float(w * h)
            return float(cv2.contourArea(pts))

        # Parse results
        for item in result:
            if isinstance(item, dict):
                boxes = item.get('rec_boxes', None)
                if boxes is None or (isinstance(boxes, np.ndarray) and boxes.size == 0) or (isinstance(boxes, list) and len(boxes) == 0):
                    boxes = item.get('boxes', [])
                texts = item.get('rec_texts', item.get('texts', []))
                scores = item.get('rec_scores', item.get('scores', [None] * len(texts)))

                for box, txt, conf in zip(boxes, texts, scores):
                    lines.append({
                        'text': txt,
                        'confidence': float(conf if conf is not None else 1.0),
                        'box': np.asarray(box, dtype=float).reshape(-1, 2).tolist(),
                        'area': _area_of(box)
                    })
                    full_text.append(txt)

            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                box, (txt, conf) = item[0], item[1]
                lines.append({
                    'text': txt,
                    'confidence': float(conf),
                    'box': np.asarray(box, dtype=float).reshape(-1, 2).tolist(),
                    'area': _area_of(box)
                })
                full_text.append(txt)

    except Exception as e:
        return jsonify({'error': f'OCR failed: {e}'}), 500

    # Pick predominant text
    predominant = pick_predominant(lines)

    payload = {
        'lines': lines,
        'text': '\n'.join(full_text),
        'predominant': predominant
    }
    if debug_mode:
        payload['debug'] = {'n_lines': len(lines), 'scores_used': True}

    return jsonify(payload), 200

if __name__ == '__main__':
    app.run(port=5001, debug=True)
