import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import PageHeader from '../components/PageHeader';

const LAST_UPDATED = 'May 3, 2026';
const CONTACT_EMAIL = 'privacy@loggr.app';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.body}>{children}</Text>
  </View>
);

export default function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <PageHeader
        title="Privacy Policy"
        subtitle={`Last updated: ${LAST_UPDATED}`}
        rightComponent={
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section title="1. Information We Collect">
          {`We collect information you provide directly when you create an account or use our services:\n\n• Account information: name, email address, and password.\n• Profile data: age, gender, height, weight, dietary goals, and activity level.\n• Food logs: meal photos, voice recordings processed for meal recognition, and manually entered food items.\n• Usage data: how you interact with the app, streak activity, and gamification progress.`}
        </Section>

        <Section title="2. How We Use Your Information">
          {`We use your information to:\n\n• Provide personalized nutrition tracking and calorie targets.\n• Power AI food recognition features (photos and voice are processed by OpenAI and not stored permanently).\n• Calculate macro and micronutrient breakdowns.\n• Enable gamification features such as quests, badges, and leaderboards.\n• Improve app features and fix issues.`}
        </Section>

        <Section title="3. Data Storage and Security">
          {`Your data is stored securely using Supabase (hosted on AWS). We use industry-standard encryption in transit (HTTPS) and at rest. Authentication is managed through Supabase Auth.\n\nMeal photos sent for AI analysis are transmitted to OpenAI's API and are subject to OpenAI's data usage policies. We do not permanently store raw meal images on our servers.`}
        </Section>

        <Section title="4. Data Sharing">
          {`We do not sell your personal data. We share data only with:\n\n• Service providers: Supabase (database/auth), OpenAI (AI analysis). These providers are contractually bound to protect your data.\n• Other users: Only public profile information (username, display name, XP level, streak) is visible to other users when you engage with social and leaderboard features. You control your username.`}
        </Section>

        <Section title="5. Your Rights">
          {`You have the right to:\n\n• Access the personal data we hold about you.\n• Correct inaccurate data via the Profile screen.\n• Delete your account and all associated data at any time from Settings → Delete Account in the app.\n• Export your data — contact us at ${CONTACT_EMAIL} to request a data export.`}
        </Section>

        <Section title="6. Account Deletion">
          {`You can permanently delete your account and all associated data from the Profile screen. This action is irreversible and removes all meal logs, progress, badges, and profile information within 30 days.`}
        </Section>

        <Section title="7. Children's Privacy">
          {`Loggr is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it promptly.`}
        </Section>

        <Section title="8. Changes to This Policy">
          {`We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this screen and, where appropriate, through an in-app notification.`}
        </Section>

        <Section title="9. Contact Us">
          {`If you have questions about this Privacy Policy or your data, please contact us at:\n\n${CONTACT_EMAIL}`}
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  });
}
