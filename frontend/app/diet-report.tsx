import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import { Colors, Radius, Spacing } from '../constants/Colors';
import { dietReportApi } from '../utils/api';
import AppCard from '../components/AppCard';
import PageHeader from '../components/PageHeader';
import SectionTitle from '../components/SectionTitle';

export default function DietReportPage() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const params = useLocalSearchParams<{ timeRange?: string }>();
  const timeRange = (params.timeRange as 'week' | 'month' | 'year') ?? 'week';

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dietReportApi.getLatestReport(timeRange)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [timeRange]);

  const gradeColor =
    report?.grade?.startsWith('A') ? '#4CAF50' :
    report?.grade?.startsWith('B') ? '#8BC34A' :
    report?.grade?.startsWith('C') ? '#FFC107' :
    report?.grade?.startsWith('D') ? '#FF9800' : '#F44336';

  return (
    <View style={styles.container}>
      <PageHeader
        title="Diet Report"
        subtitle={report?.report_date ? format(new Date(report.report_date), 'MMMM d, yyyy') : undefined}
        showBack={true}
        rightComponent={
          report?.grade ? (
            <View style={[styles.gradeBadge, {
              backgroundColor: gradeColor + '18',
              borderColor: gradeColor + '60',
            }]}>
              <Text style={[styles.gradeBadgeText, { color: gradeColor }]}>{report.grade}</Text>
            </View>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      ) : !report ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="document-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.emptyText}>No report available yet.</Text>
          <Text style={styles.emptySubText}>Log more meals to generate your report.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Grade justification card */}
          {report.grade_justification && (
            <AppCard
              style={[styles.justificationCard, {
                borderLeftColor: gradeColor,
                borderLeftWidth: 6,
                backgroundColor: gradeColor + '10',
              }]}
              padding={16}
            >
              <View style={[styles.gradeCircle, { backgroundColor: gradeColor + '20', borderColor: gradeColor + '50' }]}>
                <Text style={[styles.justificationGrade, { color: gradeColor }]}>{report.grade}</Text>
              </View>
              <Text style={styles.justificationText}>{report.grade_justification}</Text>
            </AppCard>
          )}

          {/* Executive Summary */}
          {report.executive_summary && (
            <View style={styles.section}>
              <SectionTitle title="Summary" />
              <Text style={styles.bodyText}>{report.executive_summary}</Text>
            </View>
          )}

          {/* Strengths */}
          {Array.isArray(report.strengths) && report.strengths.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Key Strengths" />
              {report.strengths.map((item: string, i: number) => (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: Colors.success + '20' }]}>
                    <Ionicons name="checkmark" size={13} color={Colors.success} />
                  </View>
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Focus Areas */}
          {Array.isArray(report.areas_for_improvement) && report.areas_for_improvement.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Focus Areas" />
              {report.areas_for_improvement.map((item: string, i: number) => (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: Colors.warning + '20' }]}>
                    <Ionicons name="arrow-up" size={13} color={Colors.warning} />
                  </View>
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Detailed Analysis */}
          {report.detailed_analysis && typeof report.detailed_analysis === 'object' && (
            <View style={styles.section}>
              <SectionTitle title="Detailed Analysis" />
              {report.detailed_analysis.macronutrients && (
                <AppCard padding={16} style={styles.analysisCard}>
                  <Text style={styles.analysisCardTitle}>⚡ Macronutrients</Text>
                  <Text style={styles.analysisCardText}>{report.detailed_analysis.macronutrients}</Text>
                </AppCard>
              )}
              {report.detailed_analysis.micronutrients && (
                <AppCard padding={16} style={styles.analysisCard}>
                  <Text style={styles.analysisCardTitle}>🧬 Micronutrients</Text>
                  <Text style={styles.analysisCardText}>{report.detailed_analysis.micronutrients}</Text>
                </AppCard>
              )}
              {report.detailed_analysis.eating_pattern && (
                <AppCard padding={16} style={styles.analysisCard}>
                  <Text style={styles.analysisCardTitle}>⏰ Eating Pattern</Text>
                  <Text style={styles.analysisCardText}>{report.detailed_analysis.eating_pattern}</Text>
                </AppCard>
              )}
              {report.detailed_analysis.food_variety && (
                <AppCard padding={16} style={styles.analysisCard}>
                  <Text style={styles.analysisCardTitle}>🌈 Food Variety</Text>
                  <Text style={styles.analysisCardText}>{report.detailed_analysis.food_variety}</Text>
                </AppCard>
              )}
            </View>
          )}

          {/* Personalized Tips */}
          {Array.isArray(report.specific_recommendations) && report.specific_recommendations.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Personalized Tips" />
              {report.specific_recommendations.map((rec: any, i: number) => (
                <AppCard key={i} style={styles.recCard} padding={16}>
                  <View style={styles.recBadge}>
                    <Text style={styles.recBadgeText}>{rec.category || 'General'}</Text>
                  </View>
                  <Text style={styles.recMain}>{rec.recommendation}</Text>
                  {rec.why && (
                    <View style={styles.recDetailRow}>
                      <Text style={styles.recLabel}>Why</Text>
                      <Text style={styles.recDetail}>{rec.why}</Text>
                    </View>
                  )}
                  {rec.how_to_implement && (
                    <View style={styles.recDetailRow}>
                      <Text style={styles.recLabel}>How</Text>
                      <Text style={styles.recDetail}>{rec.how_to_implement}</Text>
                    </View>
                  )}
                </AppCard>
              ))}
            </View>
          )}

          {/* Meal Suggestions */}
          {Array.isArray(report.meal_suggestions) && report.meal_suggestions.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Smart Meal Ideas" />
              {report.meal_suggestions.map((s: string, i: number) => (
                <View key={i} style={styles.mealRow}>
                  <View style={styles.mealDot}>
                    <Ionicons name="fast-food" size={12} color={theme.primary} />
                  </View>
                  <Text style={styles.mealText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Plan */}
          {report.action_plan && typeof report.action_plan === 'object' && (
            <View style={styles.section}>
              <SectionTitle title="Action Plan" />
              {report.action_plan.week_1 && Array.isArray(report.action_plan.week_1) && (
                <View style={styles.planBlock}>
                  <Text style={styles.planBlockTitle}>WEEK 1 — FOUNDATION</Text>
                  {report.action_plan.week_1.map((a: string, i: number) => (
                    <View key={i} style={styles.planItem}>
                      <View style={[styles.planNum, { backgroundColor: theme.textSecondary }]}>
                        <Text style={styles.planNumText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.planText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}
              {report.action_plan.week_2 && Array.isArray(report.action_plan.week_2) && (
                <View style={styles.planBlock}>
                  <Text style={styles.planBlockTitle}>WEEK 2 — MOMENTUM</Text>
                  {report.action_plan.week_2.map((a: string, i: number) => (
                    <View key={i} style={styles.planItem}>
                      <View style={[styles.planNum, { backgroundColor: theme.primary }]}>
                        <Text style={styles.planNumText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.planText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}
              {report.action_plan.ongoing && Array.isArray(report.action_plan.ongoing) && (
                <View style={styles.planBlock}>
                  <Text style={styles.planBlockTitle}>ONGOING HABITS</Text>
                  {report.action_plan.ongoing.map((a: string, i: number) => (
                    <View key={i} style={styles.planItem}>
                      <Ionicons name="repeat" size={16} color={theme.primary} style={{ marginRight: 10 }} />
                      <Text style={styles.planText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Top Foods */}
          {Array.isArray(report.top_foods) && report.top_foods.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Top Foods" />
              {report.top_foods.map((f: any, i: number) => (
                <View key={i} style={styles.foodRow}>
                  <Text style={styles.foodRank}>{i + 1}</Text>
                  <Text style={styles.foodName}>{f.name}</Text>
                  <Text style={styles.foodCount}>{f.count}x</Text>
                </View>
              ))}
            </View>
          )}

          {/* Bio Alerts */}
          {Array.isArray(report.bio_alerts) && report.bio_alerts.filter((a: any) => a.status !== 'good').length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Alerts" />
              {report.bio_alerts.filter((a: any) => a.status !== 'good').map((a: any, i: number) => {
                const alertColor = a.status === 'critical' ? Colors.error : Colors.warning;
                return (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: alertColor + '20' }]}>
                    <Ionicons name="alert" size={13} color={alertColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{a.metric}</Text>
                    <Text style={styles.listSubText}>{a.message}</Text>
                  </View>
                </View>
                );
              })}
            </View>
          )}

          {/* Red Flags */}
          {Array.isArray(report.red_flags) && report.red_flags.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Red Flags" />
              {report.red_flags.map((f: any, i: number) => (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: Colors.error + '15' }]}>
                    <Ionicons name="warning" size={13} color={Colors.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{f.title}</Text>
                    <Text style={styles.listSubText}>{f.description}</Text>
                    {f.frequency && <Text style={styles.listFreq}>{f.frequency}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    gradeBadge: {
      width: 48,
      height: 48,
      borderRadius: 14,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gradeBadgeText: {
      fontSize: 17,
      fontWeight: '900',
    },
    gradeCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    justificationGrade: {
      fontSize: 22,
      fontWeight: '900',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      marginTop: 8,
    },
    emptySubText: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 40,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.lg,
      paddingBottom: 40,
    },
    justificationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      gap: 12,
    },
    justificationText: {
      flex: 1,
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    section: {
      marginBottom: 24,
    },
    bodyText: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 22,
      backgroundColor: theme.backgroundSecondary,
      padding: 14,
      borderRadius: Radius.xxxl,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    listDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      flexShrink: 0,
    },
    listText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      lineHeight: 20,
    },
    listTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 2,
    },
    listSubText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    listFreq: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 3,
    },
    analysisCard: {
      marginBottom: 10,
    },
    analysisCardTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 6,
    },
    analysisCardText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    recCard: {
      marginBottom: 12,
    },
    recBadge: {
      backgroundColor: '#FFFDE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginBottom: 8,
    },
    recBadgeText: {
      fontSize: 10,
      fontWeight: '900',
      color: '#FBC02D',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    recMain: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 10,
      lineHeight: 20,
    },
    recDetailRow: {
      flexDirection: 'row',
      marginTop: 4,
      gap: 8,
    },
    recLabel: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.textSecondary,
      width: 32,
      paddingTop: 1,
    },
    recDetail: {
      flex: 1,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    mealRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    mealDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    mealText: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
      lineHeight: 20,
    },
    planBlock: {
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    planBlockTitle: {
      fontSize: 10,
      fontWeight: '900',
      color: theme.textSecondary,
      letterSpacing: 1.2,
      marginBottom: 12,
    },
    planItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    planNum: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    planNumText: {
      fontSize: 11,
      fontWeight: '900',
      color: '#fff',
    },
    planText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      lineHeight: 18,
    },
    foodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 10,
    },
    foodRank: {
      fontSize: 13,
      fontWeight: '900',
      color: theme.textSecondary,
      width: 20,
    },
    foodName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    foodCount: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.primary,
    },
  });
}
