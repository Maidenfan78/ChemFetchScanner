import { Alert, Text, View, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';

type ScrapedItem = {
  url: string;
  name: string;
  manufacturer: string;
  size: string;
  sdsUrl: string;
};

export const config = { title: 'Scan Results' };

export default function Results() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScrapedItem[]>([]);
  const [product, setProduct] = useState<any | null>(null);

  useEffect(() => {
    if (!code) return;
    console.log('🔍 on Results mounted with code:', code);
    console.log('📡 Sending POST to /scan with code:', code);

    fetch('http://192.168.68.52:3000/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => {
        console.log('📥 Scan fetch response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('✅ Scan API response:', data);
        const scraped = Array.isArray(data?.scraped) ? data.scraped : [];
        setItems(scraped);
        setProduct(data.product || null);
        if (data.product && (!data.product.size || !data.product.weight)) {
          Alert.alert('Missing info', 'This item is missing weight or size. Add now?', [
            {
              text: 'Add Info',
              onPress: () =>
                router.push(
                  `/confirm?code=${encodeURIComponent(code ?? '')}&name=${encodeURIComponent(
                    data.product.product_name || ''
                  )}&size=${encodeURIComponent(data.product.size || '')}&editOnly=1`
                ),
            },
            { text: 'Later', style: 'cancel' },
          ]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ Scan fetch error:', err);
        setLoading(false);
      });
  }, [code]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!product && items.length === 0) {
    console.log('🔍 No results found for code:', code);
    return (
      <View style={styles.center}>
        <Text style={styles.text}>No results found for {code}</Text>
      </View>
    );
  }

  if (product) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.heading}>{product.product_name || 'Unknown product'}</Text>
          <Text style={styles.text}>Size: {product.size || 'N/A'}</Text>
          <Text style={styles.text}>Weight: {product.weight || 'N/A'}</Text>
          {product.sds_url ? (
            <Text style={styles.link}>SDS: {product.sds_url}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  const first = items[0];
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>{first.name || 'Unknown product'}</Text>
        <Text style={styles.text}>Size: {first.size || 'N/A'}</Text>
        {first.sdsUrl ? (
          <Text style={styles.link}>SDS: {first.sdsUrl}</Text>
        ) : (
          <Text style={styles.text}>No SDS found</Text>
        )}
      </View>
      <Button
        title="Confirm with Photo"
        onPress={() =>
          router.push(
            `/confirm?code=${encodeURIComponent(code ?? '')}&name=${encodeURIComponent(
              first.name
            )}&size=${encodeURIComponent(first.size)}`
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#333' },
  heading: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  link: { color: '#1abc9c', marginTop: 8 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
});
