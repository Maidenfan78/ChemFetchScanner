import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export const config = {
  title: 'Scan Results',
};

export default function Results() {
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text>Scanned code: {code ?? 'None'}</Text>
    </View>
  );
}
