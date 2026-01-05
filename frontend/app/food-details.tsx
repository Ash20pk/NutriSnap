import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import { Colors } from '../constants/Colors';

function parseJsonParam<T>(value: unknown): T | null {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(decodeURIComponent(value)) as T;
  } catch {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}

export default function FoodDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const food = useMemo(() => parseJsonParam<any>(params.food), [params.food]);

  if (!food) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Food details"
          rightComponent={
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          }
        />
        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Unable to load</Text>
            <Text style={styles.emptyText}>Please go back and try again.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title={food.name || 'Food details'}
        subtitle={food.driver ? `${food.driver} culprit` : undefined}
        rightComponent={
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {Array.isArray(food.flags) && food.flags.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>Flagged Components</Text>
              <View style={styles.labelGrid}>
                {food.flags.map((flag: any, i: number) => (
                  <View key={i} style={styles.labelCard}>
                    <View style={styles.labelHeader}>
                      <Text style={styles.labelTitle}>{flag.label}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#FF3B3020' }]}>
                        <Text style={[styles.statusText, { color: '#FF3B30' }]}>{flag.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.labelValue}>{flag.value}</Text>
                    <Text style={styles.labelDesc}>{flag.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.sectionTitle}>Why this food?</Text>
              <Text style={styles.paragraph}>
                This item was flagged because it contains processed ingredients, hidden sweeteners, or was eaten at a time that disrupts your biological rhythm.
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  labelGrid: {
    gap: 12,
  },
  labelCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  labelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  labelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelValue: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  labelDesc: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
