import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import AnimatedCard from './AnimatedCard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

interface RecipeDetailProps {
    recipe: any;
    headerRight?: React.ReactNode;
    footer?: React.ReactNode;
}

export default function RecipeDetail({ recipe, headerRight, footer }: RecipeDetailProps) {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [activeTab, setActiveTab] = useState<'ingredients' | 'instructions'>('ingredients');

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>{recipe.name}</Text>
                    {headerRight}
                </View>
                <Text style={styles.description}>{recipe.description}</Text>

                <View style={styles.badges}>
                    <View style={styles.badge}>
                        <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
                        <Text style={styles.badgeText}>{recipe.prepTime} min</Text>
                    </View>
                    <View style={styles.badge}>
                        <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
                        <Text style={styles.badgeText}>{recipe.servings} servings</Text>
                    </View>
                    <View style={styles.badge}>
                        <Ionicons name="flame-outline" size={16} color={theme.primary} />
                        <Text style={[styles.badgeText, { color: theme.primary }]}>{recipe.calories} cal</Text>
                    </View>
                </View>
            </View>

            {/* Macros */}
            <AnimatedCard delay={100} style={styles.macrosCard}>
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.protein}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                    <View style={[styles.macroBar, { backgroundColor: Colors.progressGreen, width: '60%' }]} />
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.carbs}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                    <View style={[styles.macroBar, { backgroundColor: Colors.progressOrange, width: '40%' }]} />
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.fat}g</Text>
                    <Text style={styles.macroLabel}>Fat</Text>
                    <View style={[styles.macroBar, { backgroundColor: Colors.progressRed, width: '30%' }]} />
                </View>
            </AnimatedCard>

            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'ingredients' && styles.activeTab]}
                    onPress={() => {
                        Haptics.selectionAsync().catch(() => { });
                        setActiveTab('ingredients');
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'ingredients' && styles.activeTabText]}>Ingredients</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'instructions' && styles.activeTab]}
                    onPress={() => {
                        Haptics.selectionAsync().catch(() => { });
                        setActiveTab('instructions');
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'instructions' && styles.activeTabText]}>Instructions</Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            <AnimatedCard delay={200} style={styles.detailsCard}>
                {activeTab === 'ingredients' ? (
                    <View style={styles.list}>
                        {recipe.ingredients.map((item: string, i: number) => (
                            <View key={i} style={styles.listItem}>
                                <View style={styles.bullet} />
                                <Text style={styles.listText}>{item}</Text>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.list}>
                        {recipe.instructions.map((item: string, i: number) => (
                            <View key={i} style={styles.stepItem}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                                </View>
                                <Text style={styles.listText}>{item}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </AnimatedCard>

            {/* Tips */}
            {recipe.tips && (
                <View style={styles.tipsContainer}>
                    <Ionicons name="bulb" size={20} color={theme.primary} />
                    <Text style={styles.tipsText}>{recipe.tips}</Text>
                </View>
            )}

            {/* Footer Actions */}
            {footer}
        </ScrollView>
    );
}

function makeStyles(theme: typeof Colors) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        content: {
            padding: Spacing.xxl,
            paddingBottom: 120,
        },
        header: {
            marginBottom: Spacing.xxl,
        },
        titleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: Spacing.md,
        },
        title: {
            flex: 1,
            fontSize: 28,
            fontWeight: '900',
            color: theme.text,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: Spacing.sm,
        },
        description: {
            fontSize: 15,
            color: theme.textSecondary,
            marginBottom: Spacing.lg,
            lineHeight: 22,
            fontWeight: '500',
        },
        badges: {
            flexDirection: 'row',
            gap: Spacing.sm + 2,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.backgroundSecondary,
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: theme.border,
        },
        badgeText: {
            fontSize: 12,
            fontWeight: '800',
            color: theme.text,
            textTransform: 'uppercase',
        },
        macrosCard: {
            flexDirection: 'row',
            backgroundColor: theme.white,
            borderRadius: Radius.xxxl,
            padding: Spacing.xl,
            marginBottom: Spacing.xxl,
            borderWidth: 2,
            borderColor: theme.border,
            borderBottomWidth: Spacing.sm,
            justifyContent: 'space-between',
        },
        macroItem: {
            flex: 1,
            alignItems: 'center',
            gap: 6,
        },
        macroDivider: {
            width: 1,
            backgroundColor: theme.border,
            height: '60%',
            alignSelf: 'center',
        },
        macroValue: {
            fontSize: 20,
            fontWeight: '900',
            color: theme.text,
        },
        macroLabel: {
            fontSize: 11,
            color: theme.textSecondary,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        macroBar: {
            height: 6,
            borderRadius: 3,
            opacity: 0.9,
        },
        tabs: {
            flexDirection: 'row',
            backgroundColor: theme.backgroundSecondary,
            borderRadius: Radius.xxl,
            padding: 6,
            marginBottom: Spacing.xl,
            borderWidth: 1,
            borderColor: theme.border,
        },
        tab: {
            flex: 1,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            borderRadius: Radius.lg,
        },
        activeTab: {
            backgroundColor: theme.white,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
        },
        tabText: {
            fontSize: 14,
            fontWeight: '800',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        activeTabText: {
            color: theme.primary,
            fontWeight: '900',
        },
        detailsCard: {
            backgroundColor: theme.white,
            borderRadius: Radius.xxxxl - 4,
            padding: Spacing.xxl,
            borderWidth: 2,
            borderColor: theme.border,
            marginBottom: Spacing.xxl,
            borderBottomWidth: Spacing.sm + 2,
        },
        list: {
            gap: Spacing.lg + 2,
        },
        listItem: {
            flexDirection: 'row',
            gap: Spacing.lg - 2,
            alignItems: 'flex-start',
        },
        bullet: {
            width: Spacing.sm,
            height: Spacing.sm,
            borderRadius: Radius.xs,
            backgroundColor: theme.primary,
            marginTop: Spacing.sm,
        },
        stepItem: {
            flexDirection: 'row',
            gap: Spacing.lg,
        },
        stepNumber: {
            width: 28,
            height: 28,
            borderRadius: Radius.lg,
            backgroundColor: theme.primary + '15',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.primary + '30',
        },
        stepNumberText: {
            fontSize: 14,
            fontWeight: '900',
            color: theme.primary,
        },
        listText: {
            flex: 1,
            fontSize: 16,
            color: theme.text,
            lineHeight: 24,
            fontWeight: '600',
        },
        tipsContainer: {
            flexDirection: 'row',
            gap: Spacing.lg - 2,
            backgroundColor: theme.secondary + '10',
            padding: Spacing.xl,
            borderRadius: Radius.xxxl,
            marginBottom: Spacing.xxl,
            borderWidth: 2,
            borderColor: theme.secondary + '30',
            borderStyle: 'dashed',
        },
        tipsText: {
            flex: 1,
            fontSize: 14,
            color: theme.text,
            lineHeight: 20,
            fontWeight: '600',
        },
    });
}
