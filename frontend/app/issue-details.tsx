import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import { Colors } from '../constants/Colors';
import { format } from 'date-fns';

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

export default function IssueDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [selectedFood, setSelectedFood] = useState<any>(null);

  const issue = useMemo(() => parseJsonParam<any>(params.issue), [params.issue]);

  if (!issue) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Details"
          subtitle=""
          rightComponent={
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/analytics' as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
        title={issue.title || 'Details'}
        subtitle={issue.impact ? `Impacted: ${issue.impact}` : undefined}
        rightComponent={
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/analytics' as any)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel}>Impacted Area</Text>
              <Text style={styles.statValue}>{issue.impact}</Text>
            </View>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreText}>{issue.score}%</Text>
            </View>
          </View>

          {Array.isArray(issue.drivers) && issue.drivers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Negative Drivers</Text>
              <View style={styles.tagWrap}>
                {issue.drivers.map((driver: string, i: number) => (
                  <View key={i} style={styles.tag}>
                    <Ionicons name="trending-down" size={14} color={Colors.error} />
                    <Text style={styles.tagText}>{driver}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {Array.isArray(issue.culpritFoods) && issue.culpritFoods.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Culprit Foods</Text>
              <View style={styles.list}>
                {issue.culpritFoods.map((food: any, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.foodRow}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedFood(food);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName} numberOfLines={1}>
                        {food.name}
                      </Text>
                      <Text style={styles.foodMeta}>
                        {food.timestamp ? format(new Date(food.timestamp), 'h:mm a') : 'Today'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {issue.solution && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>The Fix</Text>
              <Text style={styles.paragraph}>{issue.solution}</Text>
            </View>
          )}

          {Array.isArray(issue.hiddenLabels) && issue.hiddenLabels.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Label Red Flags</Text>
              <View style={styles.labelGrid}>
                {issue.hiddenLabels.map((item: any, i: number) => {
                  const isCritical = item.status === 'Critical';
                  return (
                    <View key={i} style={styles.labelCard}>
                      <View style={styles.labelHeader}>
                        <Text style={styles.labelTitle}>{item.label}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: isCritical ? '#FF3B3020' : '#FF950020' },
                          ]}
                        >
                          <Text style={[styles.statusText, { color: isCritical ? '#FF3B30' : '#FF9500' }]}>
                            {item.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.labelValue}>{item.value}</Text>
                      <Text style={styles.labelDesc}>{item.desc}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={!!selectedFood}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFood(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedFood?.name}
                </Text>
                {selectedFood?.driver ? (
                  <Text style={styles.modalSubtitle}>{selectedFood.driver} culprit</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setSelectedFood(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={26} color={Colors.border} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {Array.isArray(selectedFood?.flags) && selectedFood.flags.length > 0 ? (
                <View>
                  <Text style={styles.modalSectionTitle}>Flagged Components</Text>
                  <View style={styles.labelGrid}>
                    {selectedFood.flags.map((flag: any, i: number) => (
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
                  <Text style={styles.modalSectionTitle}>Why this food?</Text>
                  <Text style={styles.paragraph}>
                    This item was flagged because it contains processed ingredients, hidden sweeteners, or was eaten at a time that disrupts your biological rhythm.
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedFood(null)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  scoreCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  section: {
    marginTop: 18,
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
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  list: {
    gap: 10,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  foodName: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
  },
  foodMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
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
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 10,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  modalCloseBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
});
