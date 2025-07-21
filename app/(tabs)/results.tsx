import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScrapedItem[]>([]);

  useEffect(() => {
    if (!code) return;
    fetch('http://192.168.68.52:3000/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, user_id: 'some-user-uuid' }), // change for auth
    })
      .then(res => res.json())
      .then(data => {
        const scraped = Array.isArray(data?.scraped) ? data.scraped : [];
        setItems(scraped);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
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
