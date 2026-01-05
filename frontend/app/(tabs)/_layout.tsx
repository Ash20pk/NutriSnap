import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { View, Platform, StyleSheet } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 2,
          borderTopColor: Colors.border,
          height: Platform.OS === 'ios' ? 100 : 80,
          paddingBottom: Platform.OS === 'ios' ? 35 : 15,
          paddingTop: 12,
          paddingHorizontal: 16,
          position: 'absolute',
          elevation: 0,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          borderWidth: 2,
          borderColor: Colors.border,
          borderBottomWidth: 0,
          shadowColor: Colors.black,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900',
          textTransform: 'uppercase',
          marginTop: 4,
        },
        tabBarItemStyle: {
          height: 50,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && { backgroundColor: Colors.primary + '15' }
            ]}>
              <Ionicons 
                name={focused ? "home" : "home-outline"} 
                size={22} 
                color={color} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && { backgroundColor: Colors.protein + '15' }
            ]}>
              <Ionicons 
                name={focused ? "stats-chart" : "stats-chart-outline"} 
                size={22} 
                color={focused ? Colors.protein : color} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => (
            <View style={styles.centerButtonContainer}>
              <View style={[styles.centerButton, focused && styles.centerButtonActive]}>
                <Ionicons name="add" size={36} color={Colors.white} />
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chef"
        options={{
          title: 'Chef',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && { backgroundColor: Colors.accent + '15' }
            ]}>
              <Ionicons 
                name={focused ? "restaurant" : "restaurant-outline"} 
                size={22} 
                color={focused ? Colors.accent : color} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="quest"
        options={{
          title: 'Quest',
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[
                styles.iconContainer,
                focused && { backgroundColor: Colors.warning + '15' },
              ]}
            >
              <Ionicons 
                name={focused ? 'trophy' : 'trophy-outline'} 
                size={22} 
                color={focused ? Colors.warning : color} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: null,
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && { backgroundColor: Colors.tertiary + '15' }
            ]}>
              <Ionicons 
                name={focused ? "person" : "person-outline"} 
                size={22} 
                color={color} 
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  centerButtonContainer: {
    position: 'absolute',
    top: -32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
    borderBottomWidth: 10,
    borderBottomColor: 'rgba(0,0,0,0.25)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  centerButtonActive: {
    transform: [{ scale: 0.92 }],
    borderBottomWidth: 4,
    marginTop: 6,
  },
});
