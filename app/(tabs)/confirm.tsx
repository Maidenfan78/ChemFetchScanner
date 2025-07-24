import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Image,
  Alert,
  TextInput,
  Modal,
  Dimensions,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TARGET_BOX_WIDTH = 0.8;
const TARGET_BOX_HEIGHT = 0.2;

export default function Confirm() {
  const { name: barcodeName = '', size: barcodeSize = '', code = '' } = useLocalSearchParams<{ name: string; size: string; code: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<any>(null);
  const [ocr, setOcr] = useState<{ bestName?: string, bestSize?: string, text?: string }>({});
  const [step, setStep] = useState<'photo' | 'crop' | 'pick' | 'edit' | 'done'>('photo');
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualSize, setManualSize] = useState('');
  const [sizePromptVisible, setSizePromptVisible] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingSize, setPendingSize] = useState('');
  const router = useRouter();

  useEffect(() => { requestPermission(); }, []);

  const cameraRef = useRef<CameraView>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  const [crop, setCrop] = useState({
    leftRatio: (1 - TARGET_BOX_WIDTH) / 2,
    topRatio: (1 - TARGET_BOX_HEIGHT) / 2,
    widthRatio: TARGET_BOX_WIDTH,
    heightRatio: TARGET_BOX_HEIGHT,
  });

  const [imageLayout, setImageLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  const getDefaultCropInfo = () => ({
    leftRatio: (1 - TARGET_BOX_WIDTH) / 2,
    topRatio: (1 - TARGET_BOX_HEIGHT) / 2,
    widthRatio: TARGET_BOX_WIDTH,
    heightRatio: TARGET_BOX_HEIGHT,
  });

  const getCurrentCropInfo = () => ({
    left: Math.round(crop.leftRatio * cameraLayout.width),
    top: Math.round(crop.topRatio * cameraLayout.height),
    width: Math.round(crop.widthRatio * cameraLayout.width),
    height: Math.round(crop.heightRatio * cameraLayout.height),
    screenWidth: cameraLayout.width,
    screenHeight: cameraLayout.height,
  });

  const capture = async () => {
    setError('');
    setOcr({});
    setStep('photo');
    if (!cameraRef.current) return;
    try {
      const pic = await cameraRef.current.takePictureAsync({ base64: true, quality: 1 });
      setPhoto(pic);
      setCrop(getDefaultCropInfo());
      setStep('crop');
    } catch (e: any) {
      setError(e?.message || String(e));
      Alert.alert('Capture Error', e?.message || String(e));
    }
  };

  const panBoxStart = useRef(crop);
  const panBox = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panBoxStart.current = { ...crop };
      },
      onPanResponderMove: (_: any, g: PanResponderGestureState) => {
        const start = panBoxStart.current;
        const left = Math.max(0, Math.min(start.leftRatio + g.dx / imageLayout.width, 1 - start.widthRatio));
        const top = Math.max(0, Math.min(start.topRatio + g.dy / imageLayout.height, 1 - start.heightRatio));
        setCrop(c => ({ ...c, leftRatio: left, topRatio: top }));
      },
    })
  ).current;

  const panTopStart = useRef(crop);
  const panTop = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panTopStart.current = { ...crop };
      },
      onPanResponderMove: (_: any, g: PanResponderGestureState) => {
        const start = panTopStart.current;
        let top = start.topRatio + g.dy / imageLayout.height;
        let height = start.heightRatio - g.dy / imageLayout.height;
        if (top < 0) {
          height += top;
          top = 0;
        }
        if (height < 0.05) {
          top = start.topRatio + start.heightRatio - 0.05;
          height = 0.05;
        }
        setCrop(c => ({ ...c, topRatio: top, heightRatio: height }));
      },
    })
  ).current;

  const panBottomStart = useRef(crop);
  const panBottom = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panBottomStart.current = { ...crop };
      },
      onPanResponderMove: (_: any, g: PanResponderGestureState) => {
        const start = panBottomStart.current;
        let height = start.heightRatio + g.dy / imageLayout.height;
        if (start.topRatio + height > 1) height = 1 - start.topRatio;
        if (height < 0.05) height = 0.05;
        setCrop(c => ({ ...c, heightRatio: height }));
      },
    })
  ).current;

  const panLeftStart = useRef(crop);
  const panLeft = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panLeftStart.current = { ...crop };
      },
      onPanResponderMove: (_: any, g: PanResponderGestureState) => {
        const start = panLeftStart.current;
        let left = start.leftRatio + g.dx / imageLayout.width;
        let width = start.widthRatio - g.dx / imageLayout.width;
        if (left < 0) {
          width += left;
          left = 0;
        }
        if (width < 0.05) {
          left = start.leftRatio + start.widthRatio - 0.05;
          width = 0.05;
        }
        setCrop(c => ({ ...c, leftRatio: left, widthRatio: width }));
      },
    })
  ).current;

  const panRightStart = useRef(crop);
  const panRight = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panRightStart.current = { ...crop };
      },
      onPanResponderMove: (_: any, g: PanResponderGestureState) => {
        const start = panRightStart.current;
        let width = start.widthRatio + g.dx / imageLayout.width;
        if (start.leftRatio + width > 1) width = 1 - start.leftRatio;
        if (width < 0.05) width = 0.05;
        setCrop(c => ({ ...c, widthRatio: width }));
      },
    })
  ).current;

  const runOcr = async () => {
    if (!photo) return;
    setError('');
    try {
      const extendedCropInfo = {
        ...getCurrentCropInfo(),
        photoWidth: photo.width,
        photoHeight: photo.height,
      };

      const res = await fetch('http://192.168.68.52:3000/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo.base64, cropInfo: extendedCropInfo }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        Alert.alert('OCR Error', data.error);
        return;
      }

      let bestName = '';
      let bestSize = '';

      if (data?.predominant?.text) {
        bestName = String(data.predominant.text).replace(/\n+/g, ' ').trim();
      } else if (typeof data.text === 'string') {
        bestName = data.text.replace(/\n+/g, ' ').trim();
      }

      if (Array.isArray(data.lines)) {
        for (const line of data.lines) {
          const txt = String(line.text || '').trim();
          if (!bestSize) {
            const m = txt.match(/(\d+(?:\.\d+)?\s?(?:ml|mL|g|kg|oz|l))/);
            if (m) bestSize = m[0];
          }
        }
      }

      if (!bestSize && typeof data.text === 'string') {
        const m = data.text.match(/(\d+(?:\.\d+)?\s?(?:ml|mL|g|kg|oz|l))/);
        if (m) bestSize = m[0];
      }

      setOcr({ bestName, bestSize, text: data.text });
      setStep('pick');
    } catch (e: any) {
      setError(e?.message || String(e));
      Alert.alert('OCR Error', e?.message || String(e));
    }
  };


  const saveItem = async (name: string, size: string) => {
    try {
      await fetch('http://192.168.68.52:3000/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, size }),
      });
    } catch (e) {
      console.error('Save error', e);
    }

    Alert.alert(
      'Saved',
      `Name: ${name}\nSize: ${size}`,
      [{
        text: 'OK', onPress: () => {
          setStep('photo');
          setPhoto(null);
          setOcr({});
          setManualName('');
          setManualSize('');
          setError('');
        }
      }]
    );
  };

  const onConfirm = (finalName: string, finalSize: string) => {
    if (!finalSize.trim()) {
      setPendingName(finalName);
      setPendingSize('');
      setSizePromptVisible(true);
      return;
    }
    saveItem(finalName, finalSize);
  };

  const sizePrompt = (
    <Modal
      transparent
      visible={sizePromptVisible}
      animationType="fade"
      onRequestClose={() => setSizePromptVisible(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalLabel}>Enter size for {pendingName}</Text>
          <TextInput
            style={styles.input}
            value={pendingSize}
            onChangeText={setPendingSize}
            placeholder="Size"
            placeholderTextColor="#aaa"
          />
          <Button title="Save" onPress={() => { setSizePromptVisible(false); saveItem(pendingName, pendingSize.trim()); }} />
          <Button title="Cancel" onPress={() => setSizePromptVisible(false)} />
        </View>
      </View>
    </Modal>
  );

  if (!permission) return <Text>Loading permissions…</Text>;
  if (!permission.granted) return <Text>No camera access</Text>;

  if (step === 'photo') {
    return (
      <>
      <View style={styles.container}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} />
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                setCameraLayout({ width, height });
              }}
            />
            <View style={styles.targetBox} pointerEvents="none">
              <View style={styles.centerLine} />
            </View>
            <Text style={styles.targetText}>Align product label inside the box</Text>
          </>
        )}
        {error ? <Text style={styles.error}>Error: {error}</Text> : null}
        <Button
          title={photo ? 'Retake' : 'Capture'}
          onPress={() => {
            if (photo) {
              setPhoto(null);
              setOcr({});
            } else {
              capture();
            }
          }}
        />
      </View>
      {sizePrompt}
      </>
    );
  }

  if (step === 'crop' && photo) {
    return (
      <>
      <View style={styles.container}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.preview}
          resizeMode="contain"
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setImageLayout({ width, height });
          }}
        />
        <View
          style={[
            styles.cropBox,
            {
              left: crop.leftRatio * imageLayout.width,
              top: crop.topRatio * imageLayout.height,
              width: crop.widthRatio * imageLayout.width,
              height: crop.heightRatio * imageLayout.height,
            },
          ]}
          {...panBox.panHandlers}
        >
          <View style={styles.centerLine} pointerEvents="none" />
          <View
            style={[styles.handle, styles.topHandle]}
            {...panTop.panHandlers}
          />
          <View
            style={[styles.handle, styles.bottomHandle]}
            {...panBottom.panHandlers}
          />
          <View
            style={[styles.handle, styles.leftHandle]}
            {...panLeft.panHandlers}
          />
          <View
            style={[styles.handle, styles.rightHandle]}
            {...panRight.panHandlers}
          />
        </View>
        {error ? <Text style={styles.error}>Error: {error}</Text> : null}
        <Button title="Run OCR" onPress={runOcr} />
      </View>
      {sizePrompt}
      </>
    );
  }

  if (step === 'pick') {
    return (
      <>
      <View style={styles.confirm}>
        <Text style={styles.heading}>Choose the correct product details:</Text>
        <View style={styles.row}>
          <View style={styles.option}>
            <Text style={styles.label}>Barcode/Web Result</Text>
            <Text>Name: {barcodeName || '(none)'}</Text>
            <Text>Size: {barcodeSize || '(none)'}</Text>
            <Button
              title="Use Barcode/Web"
              onPress={() => onConfirm(barcodeName, barcodeSize)}
            />
          </View>
          <View style={styles.option}>
            <Text style={styles.label}>Photo (OCR) Result</Text>
            <Text>Name: {ocr.bestName || '(none)'}</Text>
            <Text>Size: {ocr.bestSize || '(none)'}</Text>
            <Button
              title="Use Photo (OCR)"
              onPress={() => onConfirm(ocr.bestName || '', ocr.bestSize || '')}
            />
          </View>
        </View>
        <Button
          title="Edit Manually"
          onPress={() => {
            setStep('edit');
            setManualName('');
            setManualSize('');
          }}
        />
      </View>
      {sizePrompt}
      </>
    );
  }

  if (step === 'edit') {
    return (
      <>
      <View style={styles.edit}>
        <Text style={[styles.heading, { color: '#222' }]}>Edit Product Details</Text>
        <Text style={styles.textLabel}>Name:</Text>
        <TextInput
          style={styles.input}
          value={manualName}
          onChangeText={setManualName}
          placeholder="Add item name"
          placeholderTextColor="#aaa"
          autoFocus={true}
        />
        <Text style={styles.textLabel}>Size:</Text>
        <TextInput
          style={styles.input}
          value={manualSize}
          onChangeText={setManualSize}
          placeholder="Add size"
          placeholderTextColor="#aaa"
        />
        <Button
          title="Save"
          onPress={() => {
            if (!manualName.trim()) {
              Alert.alert("Enter item name");
              return;
            }
            onConfirm(manualName.trim(), manualSize.trim());
          }}
        />
      </View>
      {sizePrompt}
      </>
    );
  }

  return (
    <>
    <View style={styles.done}>
      <Text>Done!</Text>
      <Button title="Back" onPress={() => {
        setStep('photo');
        setPhoto(null);
        setOcr({});
        setManualName('');
        setManualSize('');
        setError('');
      }} />
    </View>
    {sizePrompt}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  camera: { flex: 1 },
  preview: { flex: 1 },
  error: { color: 'red', padding: 12 },
  targetBox: {
    position: 'absolute',
    left: `${((1 - TARGET_BOX_WIDTH) / 2) * 100}%`,
    top: `${((1 - TARGET_BOX_HEIGHT) / 2) * 100}%`,
    width: `${TARGET_BOX_WIDTH * 100}%`,
    height: `${TARGET_BOX_HEIGHT * 100}%`,
    borderWidth: 3,
    borderColor: '#4af',
    borderRadius: 10,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#4af',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#4af',
    borderRadius: 10,
  },
  handle: {
    position: 'absolute',
    backgroundColor: '#4af',
    opacity: 0.6,
  },
  topHandle: { top: -10, left: -20, right: -20, height: 20 },
  bottomHandle: { bottom: -10, left: -20, right: -20, height: 20 },
  leftHandle: { top: -20, bottom: -20, left: -10, width: 20 },
  rightHandle: { top: -20, bottom: -20, right: -10, width: 20 },
  targetText: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    color: '#222',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 15,
  },
  confirm: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  heading: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: '#222' },
  row: { flexDirection: 'row', marginTop: 20 },
  option: { flex: 1, alignItems: 'center', marginHorizontal: 8, padding: 10, borderWidth: 1, borderRadius: 10, borderColor: '#bbb', backgroundColor: '#f9f9f9' },
  label: { fontWeight: 'bold', marginBottom: 5, color: '#333' },
  edit: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  input: { borderColor: '#888', borderWidth: 1, borderRadius: 8, width: 200, marginBottom: 12, padding: 10, color: '#222', backgroundColor: '#fafafa', fontSize: 16 },
  textLabel: { alignSelf: 'flex-start', color: '#222', marginLeft: 20, marginBottom: 4, fontWeight: '500' },
  done: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    width: 250,
  },
  modalLabel: { marginBottom: 8, color: '#222', textAlign: 'center' }
});
