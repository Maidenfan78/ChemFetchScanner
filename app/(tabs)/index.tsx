import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert, Vibration } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    console.log('🔍 onBarcodeScanned fired with type and data:', type, data);
    setScanned(true);
    Vibration.vibrate(100);
    Alert.alert('Scanned', `Scanned ${type}: ${data}`, [
      {
        text: 'Results',
        onPress: () => {
          console.log('📡 Navigating to Results with code:', data);
          router.push(`/results?code=${encodeURIComponent(data)}`);
        },
      },
      { text: 'Scan again', onPress: () => setScanned(false) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['ean8', 'ean13'] }}
      />
      <View style={styles.targetBox} pointerEvents="none">
        <Text style={styles.hint}>Align barcode</Text>
      </View>
      {scanned && <Button title="Scan again" onPress={() => setScanned(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  targetBox: {
    position: 'absolute',
    top: '40%',
    left: '20%',
    width: '60%',
    height: '20%',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: { color: '#fff', fontWeight: 'bold' },
});
