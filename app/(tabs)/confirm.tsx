import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';

export default function Confirm() {
  const { name = '', size = '' } = useLocalSearchParams<{ name: string; size: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<any>(null);
  const [text, setText] = useState('');
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => { requestPermission(); }, []);

  const capture = async () => {
    if (!cameraRef.current) return;
    const pic = await cameraRef.current.takePictureAsync({ base64: true });
    setPhoto(pic);
    try {
      const res = await fetch('http://192.168.68.52:3000/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: pic.base64 }),
      });
      const data = await res.json();
      setText(data.text || '');
    } catch (e) {
      console.log('OCR error', e);
    }
  };

  const matchesName = text.toLowerCase().includes(name.toLowerCase());
  const matchesSize = size ? text.toLowerCase().includes(size.toLowerCase()) : false;

  if (!permission) return <Text>Loading permissions…</Text>;
  if (!permission.granted) return <Text>No camera access</Text>;

  return (
    <View style={styles.container}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} />
      ) : (
        <CameraView ref={cameraRef} style={styles.camera} />
      )}
      {text ? (
        <View style={styles.results}>
          <Text>Extracted: {text}</Text>
          <Text>{matchesName && matchesSize ? 'Product matches' : 'Product mismatch'}</Text>
        </View>
      ) : null}
      <Button title={photo ? 'Retake' : 'Capture'} onPress={() => { photo ? (setPhoto(null), setText('')) : capture(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  preview: { flex: 1 },
  results: { padding: 16 },
});
