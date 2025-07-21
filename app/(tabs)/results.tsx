import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { barcodeData, ProductInfo } from '@/assets/barcodeData';

type ScrapedItem = {
  url: string;
  name: string;
  manufacturer: string;
  size: string;
  sdsUrl: string;
};

export const config = { title: 'Scan Results' };

async function lookupOnline(barcode: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    const json = await res.json();
    if (json.status === 1) {
      const p = json.product;
      return {
        name: p.product_name || '',
        manufacturer: p.brands || '',
        size: p.quantity || '',
        sdsUrl: '',
      };
    }
  } catch (err) {
    console.error('Online lookup failed:', err);
  }
  return null;
}

export default function Results() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScrapedItem[]>([]);

  useEffect(() => {
    if (!code) return;
    const fetchData = async () => {
      setLoading(true);
      let data: ProductInfo | null = barcodeData[code];
      if (!data) {
        data = await lookupOnline(code);
      }
      if (data) {
        setItems([{ url: '', ...data }]);
      } else {
        setItems([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [code]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>No results found for {code}</Text>
      </View>
    );
  }

  const first = items[0];
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Product: {first.name || 'N/A'}</Text>
      <Text>Manufacturer: {first.manufacturer || 'N/A'}</Text>
      <Text>Size: {first.size || 'N/A'}</Text>
      {first.sdsUrl ? (
        <Text style={styles.link}>SDS: {first.sdsUrl}</Text>
      ) : (
        <Text>No SDS found</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#333' },
  heading: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  link: { color: 'blue', marginTop: 8 },
});
