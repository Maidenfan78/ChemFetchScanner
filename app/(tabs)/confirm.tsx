import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Image, Alert, TextInput, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TARGET_BOX_WIDTH = 0.7;
const TARGET_BOX_HEIGHT = 0.3;

export default function Confirm() {
  const { name: barcodeName = '', size: barcodeSize = '', code = '' } = useLocalSearchParams<{ name: string; size: string; code: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<any>(null);
  const [ocr, setOcr] = useState<{ bestName?: string, bestSize?: string, text?: string }>({});
  const [step, setStep] = useState<'photo' | 'pick' | 'edit' | 'done'>('photo');
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualSize, setManualSize] = useState('');
  const router = useRouter();

  useEffect(() => { requestPermission(); }, []);

  const cameraRef = useRef<CameraView>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  const getCropInfo = () => ({
    left: Math.round((1 - TARGET_BOX_WIDTH) / 2 * cameraLayout.width),
    top: Math.round((1 - TARGET_BOX_HEIGHT) / 2 * cameraLayout.height),
    width: Math.round(cameraLayout.width * TARGET_BOX_WIDTH),
    height: Math.round(cameraLayout.height * TARGET_BOX_HEIGHT),
    screenWidth: cameraLayout.width,
    screenHeight: cameraLayout.height
  });

  const capture = async () => {
    setError('');
    setOcr({});
    setStep('photo');
    if (!cameraRef.current) return;
    try {
      const pic = await cameraRef.current.takePictureAsync({ base64: true, quality: 1 });
      setPhoto(pic);

      // Include actual photo width and height with cropInfo
      const extendedCropInfo = {
        ...getCropInfo(),
        photoWidth: pic.width,
        photoHeight: pic.height,
      };

      const res = await fetch('http://192.168.68.52:3000/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: pic.base64, cropInfo: extendedCropInfo }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        Alert.alert('OCR Error', data.error);
        return;
      }

      let bestName = '';
      let bestSize = '';

      if (Array.isArray(data.lines)) {
        for (const line of data.lines) {
          const txt = String(line.text || '').trim();
          if (txt.length > bestName.length) {
            bestName = txt;
          }
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
      Alert.alert('Capture Error', e?.message || String(e));
    }
  };


  const onConfirm = async (finalName: string, finalSize: string) => {
    try {
      await fetch('http://192.168.68.52:3000/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: finalName, size: finalSize }),
      });
    } catch (e) {
      console.error('Save error', e);
    }

    Alert.alert(
      'Saved',
      `Name: ${finalName}\nSize: ${finalSize}`,
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

  if (!permission) return <Text>Loading permissions…</Text>;
  if (!permission.granted) return <Text>No camera access</Text>;

  if (step === 'photo') {
    return (
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
            <View style={styles.targetBox} pointerEvents="none" />
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
    );
  }

  if (step === 'pick') {
    return (
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
    );
  }

  if (step === 'edit') {
    return (
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
    );
  }

  return (
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
  },
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
  done: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }
});
