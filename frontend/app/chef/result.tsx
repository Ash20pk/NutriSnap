import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Animated } from 'react-native';
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

export default function RecipeResultScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
    const { user } = useUser();
    const params = useLocalSearchParams();
    const recipe = params.recipe ? JSON.parse(params.recipe as string) : null;
    const [loading, setLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    // Animation for save button
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    // If no recipe passed, go back
    if (!recipe) {
        if (router.canGoBack()) router.back();
        return null;
    }

    const animateSave = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 1.3,
                useNativeDriver: true,
                friction: 3,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 3,
            }),
        ]).start();
    };

    const handleSave = async () => {
        if (!user || saving || isSaved) return;

        setSaving(true);
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
            await recipeApi.save(user.id, recipe);
            setIsSaved(true);
            animateSave();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        } catch (error) {
            Alert.alert('Error', 'Failed to save recipe');
        } finally {
            setSaving(false);
        }
    };

    const handleLog = async () => {
        if (!user) return;
        setLoading(true);
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
            await mealApi.logMeal({
                user_id: user.id,
                meal_type: 'lunch',
                foods: [{
                    name: recipe.name,
                    quantity: 1,
                    calories: recipe.calories,
                    protein: recipe.protein,
                    carbs: recipe.carbs,
                    fat: recipe.fat,
                }],
                logging_method: 'chef',
                notes: `AI Chef Recipe: ${recipe.name}`,
            });
            router.replace('/(tabs)/log');
            Alert.alert('Logged', 'Meal logged successfully!');
        } catch (error) {
            Alert.alert('Error', 'Failed to log meal');
        } finally {
            setLoading(false);
        }
    };

    const HeaderRight = (
        <TouchableOpacity
            onPress={handleSave}
            style={[
                styles.iconBtn,
                isSaved && styles.iconBtnSaved,
            ]}
            disabled={saving || isSaved}
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Ionicons
                    name={isSaved ? "bookmark" : "bookmark-outline"}
                    size={24}
                    color={isSaved ? theme.white : theme.primary}
                />
            </Animated.View>
        </TouchableOpacity>
    );

    const Footer = (
        <View style={styles.footer}>
            <TouchableOpacity
                style={[
                    styles.saveBtn,
                    isSaved && styles.saveBtnSaved,
                ]}
                onPress={handleSave}
                disabled={saving || isSaved}
            >
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Ionicons
                        name={isSaved ? "bookmark" : "bookmark-outline"}
                        size={20}
                        color={isSaved ? theme.white : theme.text}
                    />
                </Animated.View>
                <Text style={[
                    styles.saveBtnText,
                    isSaved && styles.saveBtnTextSaved,
                ]}>
                    {isSaved ? 'Saved!' : 'Save'}
                </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
                <DuoButton
                    title="Log This Meal"
                    onPress={handleLog}
                    loading={loading}
                    disabled={loading}
                    size="medium"
                    color={theme.primary}
                />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <PageHeader title="Your Recipe" showBack />

            <RecipeDetail
                recipe={recipe}
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
    iconBtnSaved: {
        backgroundColor: theme.primary,
        borderColor: theme.primaryDark,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    saveBtn: {
        backgroundColor: theme.white,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: 2,
        borderColor: theme.border,
        borderBottomWidth: 6,
        flexDirection: 'row',
        gap: 10,
    },
    saveBtnSaved: {
        backgroundColor: theme.primary,
        borderColor: theme.primaryDark,
    },
    saveBtnText: {
        fontSize: 14,
        fontWeight: '900',
        color: theme.text,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    saveBtnTextSaved: {
        color: theme.white,
    },
  });
}
