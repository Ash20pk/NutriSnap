import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Colors } from '../../constants/Colors';
import PageHeader from '../../components/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../../components/EmptyState';
import { useUser } from '../../context/UserContext';
import { recipeApi } from '../../utils/api';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function SavedRecipesScreen() {
    const { user } = useUser();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRecipes = React.useCallback(async () => {
        if (!user) return;
        try {
            const data = await recipeApi.getSaved(user.id);
            setRecipes(data.recipes || []);
        } catch (error) {
            console.error('Error fetching recipes:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(
        React.useCallback(() => {
            fetchRecipes();
        }, [fetchRecipes])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchRecipes();
    };

    const handlePress = (recipe: any) => {
        Haptics.selectionAsync().catch(() => { });
        // Pass the saved recipe ID to details page
        router.push({ pathname: '/chef/details', params: { id: recipe.id } });
    };

    const handleToggleFavorite = async (recipeId: string, currentState: boolean) => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
            // Optimistic update
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, is_favorite: !currentState } : r
            ));

            await recipeApi.toggleFavorite(recipeId);
        } catch (error) {
            console.error('Error toggling favorite:', error);
            // Revert on error
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, is_favorite: currentState } : r
            ));
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => handlePress(item)}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.recipeName}>{item.recipe?.name || 'Untitled Recipe'}</Text>
                <TouchableOpacity
                    onPress={() => handleToggleFavorite(item.id, !!item.is_favorite)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons
                        name={item.is_favorite ? "heart" : "heart-outline"}
                        size={22}
                        color={item.is_favorite ? "#FF3B30" : Colors.textSecondary}
                    />
                </TouchableOpacity>
            </View>
            <Text style={styles.description} numberOfLines={2}>
                {item.recipe?.description}
            </Text>
            <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.metaText}>{item.recipe?.prepTime}m</Text>
                </View>
                <View style={styles.metaItem}>
                    <Ionicons name="flame-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.metaText}>{item.recipe?.calories} cal</Text>
                </View>
                <Text style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString()}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <PageHeader
                title="Saved Recipes"
                subtitle="Your AI culinary collection"
                showBack
            />

            <FlatList
                data={recipes}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                }
                ListEmptyComponent={
                    !loading ? (
                        <EmptyState
                            icon="book-outline"
                            title="No saved recipes yet"
                            subtitle="Generate recipes with AI Chef and save them here!"
                        />
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    listContent: {
        padding: 24,
        gap: 20,
        paddingBottom: 60,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: 28,
        padding: 20,
        borderWidth: 2,
        borderColor: Colors.border,
        borderBottomWidth: 8,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    recipeName: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.text,
        flex: 1,
        marginRight: 8,
        letterSpacing: -0.5,
    },
    description: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 16,
        lineHeight: 20,
        fontWeight: '500',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.backgroundSecondary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    metaText: {
        fontSize: 12,
        fontWeight: '800',
        color: Colors.textSecondary,
        textTransform: 'uppercase',
    },
    dateText: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginLeft: 'auto',
        fontWeight: '700',
        opacity: 0.5,
    },
});
