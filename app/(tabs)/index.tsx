import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';

export default function Scanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  useEffect(() => {
    requestPermission();
  }, []);

  if (!permission) return <Text>Loading permissions…</Text>;
  if (!permission.granted) return <Text>No camera access 🙁</Text>;

  const handleBarcodeScanned = ({ type, data }: BarcodeScanningResult) => {
    setScanned(true);
    Alert.alert('Scanned', `Scanned ${type}: ${data}`, [
      {
        text: 'Results',
        onPress: () => router.push(`/results?code=${encodeURIComponent(data)}`),
      },
      { text: 'Scan again', onPress: () => setScanned(false) },
    ]);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['ean8', 'ean13'] }}
      />
      {scanned && <Button title="Scan again" onPress={() => setScanned(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
