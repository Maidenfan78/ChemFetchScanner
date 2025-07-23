from flask import Flask, request, jsonify
import cv2
import numpy as np
import pytesseract

app = Flask(__name__)

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
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    (h, w) = thresh.shape
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    deskewed = cv2.warpAffine(thresh, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return deskewed

def extract_main_label(processed):
    d = pytesseract.image_to_data(processed, output_type=pytesseract.Output.DICT, config='--psm 6')
    n = len(d['text'])
    max_height = 0
    main_line = ''
    for i in range(n):
        txt = d['text'][i].strip()
        if len(txt) < 2: continue
        height = int(d['height'][i])
        if height > max_height:
            max_height = height
            main_line = txt
    return main_line

@app.route('/ocr', methods=['POST'])
def ocr():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    img_file = request.files['image']
    img_bytes = img_file.read()

    processed = preprocess_image(img_bytes)
    # Get OCR data with bounding boxes
    d = pytesseract.image_to_data(processed, output_type=pytesseract.Output.DICT, config='--psm 6')
    n = len(d['text'])
    all_lines = []
    for i in range(n):
        txt = d['text'][i].strip()
        height = int(d['height'][i])
        if len(txt) > 0:
            all_lines.append({'text': txt, 'height': height})
    raw_text = pytesseract.image_to_string(processed, config='--psm 6')
    return jsonify({
        'lines': all_lines,
        'text': raw_text
    })


if __name__ == '__main__':
    app.run(port=5001, debug=True)
