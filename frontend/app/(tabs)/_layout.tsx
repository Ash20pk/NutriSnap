import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { View, Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 12,
          paddingTop: 12,
          position: 'absolute',
          elevation: 0,
          shadowColor: Colors.shadowDark,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: focused ? Colors.primary + '15' : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons name={focused ? "home" : "home-outline"} size={26} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log Meal',
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                backgroundColor: Colors.primary,
                borderRadius: 32,
                width: 64,
                height: 64,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 32,
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Ionicons name="add" size={36} color={Colors.white} />
            </View>
          ),
          tabBarLabel: '',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: focused ? Colors.secondary + '15' : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons name={focused ? "time" : "time-outline"} size={26} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: focused ? Colors.tertiary + '15' : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons name={focused ? "person" : "person-outline"} size={26} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}