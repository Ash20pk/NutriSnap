import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import PageHeader from '../../components/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { mealApi, recipeApi } from '../../utils/api';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import RecipeDetail from '../../components/RecipeDetail';
import * as Haptics from 'expo-haptics';
import DuoButton from '../../components/DuoButton';

export default function SavedRecipeDetailsScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
    const { user } = useUser();
    const { id } = useLocalSearchParams();
    const [recipeItem, setRecipeItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [logging, setLogging] = useState(false);

    useEffect(() => {
        if (user && id) {
            fetchRecipe();
        }
    }, [user, id]);

    const fetchRecipe = async () => {
        try {
            const data = await recipeApi.getSaved(user?.id || '');
            // Client-side find since we don't have a get-by-id endpoint yet for single item
            // Optimistically we assume the list is small enough or we should add getById endpoint
            // Actually the list endpoint returns all saved recipes, let's filter
            const found = data.recipes.find((r: any) => r.id === id);
            setRecipeItem(found);
        } catch (error) {
            console.error('Error fetching recipe details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleFavorite = async () => {
        if (!recipeItem) return;
        try {
            Haptics.selectionAsync();
            const data = await recipeApi.toggleFavorite(recipeItem.id);
            setRecipeItem((prev: any) => ({ ...prev, is_favorite: data.is_favorite }));
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            'Delete Recipe',
            'Are you sure you want to remove this recipe from your collection?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await recipeApi.delete(recipeItem.id);
                            router.back();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete recipe');
                        }
                    }
                }
            ]
        );
    };

    const handleLog = async () => {
        if (!user || !recipeItem) return;
        setLogging(true);
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
            const r = recipeItem.recipe;

            // Increment cooked count
            await recipeApi.markCooked(recipeItem.id);

            // Log meal
            await mealApi.logMeal({
                user_id: user.id,
                meal_type: 'lunch',
                foods: [{
                    name: r.name,
                    quantity: 1,
                    calories: r.calories,
                    protein: r.protein,
                    carbs: r.carbs,
                    fat: r.fat,
                }],
                logging_method: 'chef_saved',
                notes: `Cooked Recipe: ${r.name}`,
            });

            router.replace('/(tabs)/log');
            Alert.alert('Bon Appétit!', 'Meal logged and cooked count updated.');
        } catch (error) {
            Alert.alert('Error', 'Failed to log meal');
        } finally {
            setLogging(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    if (!recipeItem) {
        return (
            <View style={[styles.container, styles.center]}>
                <Text style={styles.errorText}>Recipe not found</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
                    <Text style={{ color: theme.primary, fontWeight: '700' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const HeaderRight = (
        <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconBtn}>
                <Ionicons
                    name={recipeItem.is_favorite ? "heart" : "heart-outline"}
                    size={24}
                    color={recipeItem.is_favorite ? "#FF3B30" : theme.text}
                />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={24} color={theme.text} />
            </TouchableOpacity>
        </View>
    );

    const Footer = (
        <View style={styles.footer}>
            <View style={{ flex: 1 }}>
                <DuoButton
                    title="Cook & Log"
                    subtitle={`Cooked ${recipeItem.times_cooked} times`}
                    onPress={handleLog}
                    loading={logging}
                    disabled={logging}
                    size="medium"
                    color={theme.primary}
                />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <PageHeader title="Recipe Details" showBack />

            <RecipeDetail
                recipe={recipeItem.recipe}
                headerRight={HeaderRight}
                footer={Footer}
            />
        </View>
    );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 16,
        color: theme.textSecondary,
        fontWeight: '700',
    },
    headerRight: {
        flexDirection: 'row',
        gap: 10,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: theme.border,
        borderBottomWidth: 4,
    },
    footer: {
        marginTop: 8,
    },
  });
}
