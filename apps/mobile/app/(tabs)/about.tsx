import { StyleSheet } from 'react-native';
import { Text, View } from '@/components/Themed';
import { ExternalLink } from '@/components/ExternalLink';

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChemFetchScanner</Text>
      <Text style={styles.subtitle}>Barcode & OCR Toolkit</Text>
      <Text style={styles.body}>
        Scan barcodes to fetch product details, confirm with a photo and store the results in Supabase.
      </Text>
      <ExternalLink href="https://github.com/">
        <Text style={styles.link}>Project source</Text>
      </ExternalLink>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 16, marginBottom: 12 },
  body: { textAlign: 'center', marginBottom: 16, maxWidth: 300 },
  link: { color: '#1abc9c', marginTop: 8 },
});
