import { Text, View } from 'react-native';
import { Stack } from 'expo-router'; // ← add this
import { useLocalSearchParams } from 'expo-router';

export default function Results() {
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Stack.Screen options={{ title: 'Scan Results' }} />  {/* configure header */}
      <Text>Scanned code: {code}</Text>
      {/* Later: send code to backend, parse and show product info */}
    </View>
  );
}
