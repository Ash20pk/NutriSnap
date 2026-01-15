import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import AnimatedCard from './AnimatedCard';
import * as Haptics from 'expo-haptics';

interface RecipeDetailProps {
    recipe: any;
    headerRight?: React.ReactNode;
    footer?: React.ReactNode;
}

export default function RecipeDetail({ recipe, headerRight, footer }: RecipeDetailProps) {
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
                        <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.badgeText}>{recipe.prepTime} min</Text>
                    </View>
                    <View style={styles.badge}>
                        <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.badgeText}>{recipe.servings} servings</Text>
                    </View>
                    <View style={styles.badge}>
                        <Ionicons name="flame-outline" size={16} color={Colors.primary} />
                        <Text style={[styles.badgeText, { color: Colors.primary }]}>{recipe.calories} cal</Text>
                    </View>
                </View>
            </View>

            {/* Macros */}
            <AnimatedCard delay={100} style={styles.macrosCard}>
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.protein}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                    <View style={[styles.macroBar, { backgroundColor: '#34C759', width: '60%' }]} />
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.carbs}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                    <View style={[styles.macroBar, { backgroundColor: '#FF9500', width: '40%' }]} />
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{recipe.fat}g</Text>
                    <Text style={styles.macroLabel}>Fat</Text>
                    <View style={[styles.macroBar, { backgroundColor: '#FF3B30', width: '30%' }]} />
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
                    <Ionicons name="bulb" size={20} color={Colors.primary} />
                    <Text style={styles.tipsText}>{recipe.tips}</Text>
                </View>
            )}

            {/* Footer Actions */}
            {footer}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: 24,
        paddingBottom: 120,
    },
    header: {
        marginBottom: 24,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    title: {
        flex: 1,
        fontSize: 28,
        fontWeight: '900',
        color: Colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    description: {
        fontSize: 15,
        color: Colors.textSecondary,
        marginBottom: 16,
        lineHeight: 22,
        fontWeight: '500',
    },
    badges: {
        flexDirection: 'row',
        gap: 10,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.backgroundSecondary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '800',
        color: Colors.text,
        textTransform: 'uppercase',
    },
    macrosCard: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
        borderRadius: 24,
        padding: 20,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: Colors.border,
        borderBottomWidth: 8,
        justifyContent: 'space-between',
    },
    macroItem: {
        flex: 1,
        alignItems: 'center',
        gap: 6,
    },
    macroDivider: {
        width: 1,
        backgroundColor: Colors.border,
        height: '60%',
        alignSelf: 'center',
    },
    macroValue: {
        fontSize: 20,
        fontWeight: '900',
        color: Colors.text,
    },
    macroLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
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
        backgroundColor: Colors.backgroundSecondary,
        borderRadius: 20,
        padding: 6,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 14,
    },
    activeTab: {
        backgroundColor: Colors.white,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '800',
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    activeTabText: {
        color: Colors.primary,
        fontWeight: '900',
    },
    detailsCard: {
        backgroundColor: Colors.white,
        borderRadius: 28,
        padding: 24,
        borderWidth: 2,
        borderColor: Colors.border,
        marginBottom: 24,
        borderBottomWidth: 10,
    },
    list: {
        gap: 18,
    },
    listItem: {
        flexDirection: 'row',
        gap: 14,
        alignItems: 'flex-start',
    },
    bullet: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
        marginTop: 8,
    },
    stepItem: {
        flexDirection: 'row',
        gap: 16,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.primary + '15',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.primary + '30',
    },
    stepNumberText: {
        fontSize: 14,
        fontWeight: '900',
        color: Colors.primary,
    },
    listText: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
        lineHeight: 24,
        fontWeight: '600',
    },
    tipsContainer: {
        flexDirection: 'row',
        gap: 14,
        backgroundColor: Colors.secondary + '10',
        padding: 20,
        borderRadius: 24,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: Colors.secondary + '30',
        borderStyle: 'dashed',
    },
    tipsText: {
        flex: 1,
        fontSize: 14,
        color: Colors.text,
        lineHeight: 20,
        fontWeight: '600',
    },
});
