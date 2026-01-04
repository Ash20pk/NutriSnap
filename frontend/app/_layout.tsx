import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { UserProvider } from '../context/UserContext';
import { View } from 'react-native';
import { Colors } from '../constants/Colors';

export default function RootLayout() {
  return (
    <AuthProvider>
      <UserProvider>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="intro" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="auth-callback" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="camera" />
          </Stack>
        </View>
      </UserProvider>
    </AuthProvider>
  );
}