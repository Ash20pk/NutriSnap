import axios, { AxiosHeaders } from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

// ============ TYPE DEFINITIONS ============

// User types
export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  goal: string;
  activity_level: string;
  dietary_preference: string;
  daily_calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  bio?: string | null;
  avatar_url?: string | null;
  username?: string | null;
  followers_count?: number;
  following_count?: number;
  created_at?: string;
  onboarding_completed: boolean;
}

export interface OnboardingData {
  name: string;
  age: number;
  gender: string;
  height?: number;
  weight?: number;
  goal: string;
  activity_level: string;
  dietary_preference?: string;
}

// Food types
export interface Food {
  id?: string;
  name: string;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  serving_size?: number;
  serving_unit?: string;
  category?: string;
  is_vegetarian?: boolean;
  quantity?: number;
  unit?: string;
}

export interface FoodWithServing extends Food {
  quantity?: number;
  unit?: string;
  total_calories?: number;
  total_protein?: number;
  total_carbs?: number;
  total_fat?: number;
  // Allow direct calorie/macro values for simplified food objects
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  food_id?: string;
  displayQuantity?: number;
  displayUnit?: string;
}

// Meal types
export interface MealLogData {
  user_id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: FoodWithServing[];
  notes?: string;
  logged_via?: 'manual' | 'photo' | 'voice' | 'barcode' | 'chef' | 'chef_saved';
  logging_method?: 'manual' | 'photo' | 'voice' | 'barcode' | 'chef' | 'chef_saved';
  image_base64?: string;
}

export interface Meal {
  id: string;
  user_id: string;
  meal_type: string;
  foods: FoodWithServing[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  notes?: string;
  logged_via?: string;
  logged_at: string;
}

export interface MealStats {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

// Photo analysis types
export interface PhotoAnalysisResult {
  coin_detected: boolean;
  coin_type?: string;
  foods: FoodWithServing[];
  notes?: string;
}

export interface VoiceToMealResult {
  transcript: string;
  foods: FoodWithServing[];
  meal_type?: string;
}

// Recipe types
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  prepTime?: number;
  servings?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  tips?: string;
  is_favorite?: boolean;
  times_cooked?: number;
}

export interface SavedRecipe extends Recipe {
  user_id: string;
  source: string;
  saved_at: string;
}

// Quest types - flexible to allow component-specific extensions
export interface ApiQuest {
  id: string;
  title: string;
  description?: string;
  icon: string;
  icon_color?: string;
  xp?: number;
  xp_reward?: number;
  current: number;
  progress?: number;
  target: number;
  unit?: string;
  is_completed: boolean;
  xp_claimed?: boolean;
  is_claimed?: boolean;
}

export interface ApiBadge {
  id: string;
  type?: string;
  name?: string;
  title?: string;
  description: string;
  icon: string;
  xp?: number;
  tier?: number;
  earned?: boolean;
  earned_at?: string;
}

export interface ApiQuestStats {
  total_xp: number;
  level: number;
  xp_for_next_level: number;
  current_streak: number;
  longest_streak: number;
  badges_earned: number;
  quests_completed?: number;
}

export interface ApiLeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  total_xp: number;
  level?: number;
  badges_earned?: number;
  is_current_user?: boolean;
}

export interface ApiBadgeCheckResult {
  new_badges?: ApiBadge[];
  newly_earned: ApiBadge[];
  xp_earned: number;
}

export interface ApiClaimResult {
  xp_earned: number;
  total_xp: number;
  level: number;
  quests_completed: number;
}

// Analytics types
export interface AnalyticsInsight {
  title: string;
  description: string;
  type?: string;
}

export interface BioAlert {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface BioImpact {
  heart?: number;
  liver?: number;
  kidney?: number;
  brain?: number;
  skin?: number;
  [key: string]: number | undefined;
}

export interface AnalyticsData {
  insights: Record<string, unknown>;
  bio_impact: BioImpact | Record<string, unknown>;
  health_insights: Record<string, unknown>;
  bio_alerts: BioAlert[] | unknown[];
  red_flags: string[] | unknown[];
  cached: boolean;
  stale?: boolean;
  last_refreshed_at?: string;
  expires_at?: string;
  meals_analyzed?: number;
}

// ============ API CONFIGURATION ============

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

if (__DEV__) {
  console.log('[API] Resolved API_URL:', API_URL);
}

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request logging
api.interceptors.request.use(
  async (request) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;

    // Debug: decode token to see algorithm
    if (__DEV__) {
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const header = JSON.parse(atob(parts[0]));
            console.log('[API] Token algorithm:', header.alg);
          }
        } catch {
          console.warn('[API] Could not decode token');
        }
      } else {
        console.log('[API] No token available');
      }
    }

    // Only ever send Supabase session access_token (prevents sending Apple ES256 identity tokens).
    const headers = AxiosHeaders.from(request.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.delete('Authorization');
      delete api.defaults.headers.common.Authorization;
    }

    request.headers = headers;
    if (__DEV__) {
      console.log('[API Request]', {
        method: request.method?.toUpperCase(),
        url: `${request.baseURL ?? ''}${request.url ?? ''}`,
        data: request.data,
        params: request.params,
        hasAuth: !!token,
      });
    }
    return request;
  },
  (error) => {
    if (__DEV__) {
      console.error('[API Request Error]', error);
    }
    return Promise.reject(error);
  }
);

// Response logging
api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log('[API Response]', {
        status: response.status,
        url: response.config.url,
        data: response.data,
      });
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const requestUrl = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`;
    const isExpectedMissingProfile =
      status === 404 && (error.config?.url === '/user/me' || requestUrl.endsWith('/api/user/me'));

    if (__DEV__ && !isExpectedMissingProfile) {
      console.error('[API Response Error]', {
        message: error.message,
        code: error.code,
        status,
        data: error.response?.data,
        url: requestUrl,
      });
    }

    if (status === 401) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      try {
        delete api.defaults.headers.common.Authorization;
      } catch {
        // ignore
      }
      try {
        router.replace('/intro' as any);
      } catch {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

// User API
export const userApi = {
  onboard: async (userData: OnboardingData): Promise<UserProfile> => {
    const response = await api.post('/user/onboard', userData);
    return response.data;
  },
  getMe: async (): Promise<UserProfile> => {
    const response = await api.get('/user/me');
    return response.data;
  },
  updateMyProfile: async (payload: { bio?: string | null; avatar_url?: string | null }): Promise<UserProfile> => {
    const response = await api.put('/user/me/profile', payload);
    return response.data;
  },
  getUser: async (userId: string): Promise<UserProfile> => {
    const response = await api.get(`/user/${userId}`);
    return response.data;
  },
  updateGoals: async (userId: string, goal: string, activityLevel: string): Promise<UserProfile> => {
    const response = await api.put(`/user/${userId}/goals`, { goal, activity_level: activityLevel });
    return response.data;
  },
};

// Food API
export const foodApi = {
  searchFoods: async (query: string = '', category: string = '', vegetarianOnly: boolean = false): Promise<{ foods: Food[] }> => {
    const response = await api.get('/foods/search', {
      params: { query, category, vegetarian_only: vegetarianOnly },
    });
    return response.data;
  },
  getByBarcode: async (barcode: string): Promise<{ food: Food; cached: boolean }> => {
    const response = await api.get(`/foods/barcode/${encodeURIComponent(barcode)}`);
    return response.data;
  },
  getCategories: async (): Promise<{ categories: string[] }> => {
    const response = await api.get('/foods/categories');
    return response.data;
  },
};

// Meal API
export const mealApi = {
  hasFood: async (imageBase64: string, userId: string): Promise<{ has_food: boolean; confidence?: number }> => {
    const response = await api.post('/meals/has-food', {
      image_base64: imageBase64,
      user_id: userId,
    });
    return response.data;
  },
  voiceToMeal: async (audioUri: string, userId: string): Promise<VoiceToMealResult> => {
    const form = new FormData();
    form.append('user_id', userId);
    form.append('audio', {
      uri: audioUri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);

    const response = await api.post('/meals/voice-to-meal', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
    return response.data;
  },
  transcribeAudio: async (audioUri: string, userId: string): Promise<{ transcript: string }> => {
    const form = new FormData();
    form.append('user_id', userId);
    form.append('audio', {
      uri: audioUri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);

    const response = await api.post('/meals/transcribe', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
    return response.data;
  },
  inferPortionFromAudio: async (
    audioUri: string,
    userId: string
  ): Promise<{ transcript: string; quantity: number | null; unit: 'g' | 'oz' | null }> => {
    const form = new FormData();
    form.append('user_id', userId);
    form.append('audio', {
      uri: audioUri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);

    const response = await api.post('/meals/infer-portion', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
    return response.data;
  },
  textToMeal: async (
    text: string,
    userId: string
  ): Promise<{ transcript: string; foods: any[] }> => {
    const response = await api.post('/meals/text-to-meal', {
      user_id: userId,
      text,
    });
    return response.data;
  },
  logPhoto: async (imageBase64: string, userId: string): Promise<PhotoAnalysisResult> => {
    const response = await api.post('/meals/log-photo', {
      image_base64: imageBase64,
      user_id: userId,
    });
    return response.data;
  },
  logMeal: async (mealData: MealLogData): Promise<Meal> => {
    const response = await api.post('/meals/log', mealData);
    return response.data;
  },
  getHistory: async (userId: string, days: number = 7): Promise<{ meals: Meal[]; count: number }> => {
    // Get timezone offset in minutes (e.g., IST = 330, EST = -300)
    const timezoneOffset = -new Date().getTimezoneOffset();
    const response = await api.get(`/meals/history/${userId}?days=${days}&timezone_offset=${timezoneOffset}`);
    return response.data;
  },
  getStats: async (userId: string, date?: string): Promise<MealStats> => {
    // Get timezone offset in minutes
    const timezoneOffset = -new Date().getTimezoneOffset();
    const dateParam = date ? `date=${date}&` : '';
    const response = await api.get(`/meals/stats/${userId}?${dateParam}timezone_offset=${timezoneOffset}`);
    return response.data;
  },
};

// Analytics API
export const analyticsApi = {
  getAnalytics: async (userId: string, timeRange: 'week' | 'month' | 'year' = 'week'): Promise<AnalyticsData> => {
    const response = await api.get(`/analytics/${userId}?time_range=${timeRange}`);
    return response.data;
  },
  getAnalyticsBundle: async (
    userId: string,
    timeRange: 'week' | 'month' | 'year' = 'week',
    timezoneOffset?: number
  ): Promise<{ time_range: string; days: number; history: { meals: Meal[]; count: number }; ai: AnalyticsData }> => {
    const tz = typeof timezoneOffset === 'number' ? timezoneOffset : -new Date().getTimezoneOffset();
    const response = await api.get(
      `/analytics/${userId}/bundle?time_range=${timeRange}&timezone_offset=${tz}`
    );
    return response.data;
  },
  refreshAnalytics: async (userId: string, timeRange: 'week' | 'month' | 'year' = 'week'): Promise<AnalyticsData> => {
    const response = await api.post(`/analytics/${userId}/refresh?time_range=${timeRange}`);
    return response.data;
  },
};

// Chef API
export interface ChefGenerateRequest {
  user_id: string;
  ingredients: string[];
  goals: string[];
  cuisine?: string;
  dietary_preference?: string;
  target_meal?: string;
}

export const chefApi = {
  generate: async (request: ChefGenerateRequest) => {
    const response = await api.post('/chef/generate', request);
    return response.data;
  },
};

// Recipe API (Saved Recipes)
export const recipeApi = {
  save: async (userId: string, recipeData: Omit<Recipe, 'id'>, source: string = 'chef'): Promise<SavedRecipe> => {
    const response = await api.post('/recipes/save', { user_id: userId, recipe_data: recipeData, source });
    return response.data;
  },
  getSaved: async (userId: string): Promise<{ recipes: SavedRecipe[] }> => {
    const response = await api.get(`/recipes/saved/${userId}`);
    return response.data;
  },
  delete: async (recipeId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/recipes/${recipeId}`);
    return response.data;
  },
  toggleFavorite: async (recipeId: string): Promise<{ is_favorite: boolean }> => {
    const response = await api.put(`/recipes/${recipeId}/favorite`);
    return response.data;
  },
  markCooked: async (recipeId: string): Promise<{ times_cooked: number }> => {
    const response = await api.put(`/recipes/${recipeId}/cooked`);
    return response.data;
  },
};

// Quest API
export const questApi = {
  getDailyQuests: async (userId: string): Promise<{ quests: ApiQuest[] }> => {
    const response = await api.get(`/quests/${userId}/daily`);
    return response.data;
  },
  claimQuestXp: async (userId: string, questId: string): Promise<ApiClaimResult> => {
    const response = await api.post(`/quests/${userId}/claim/${questId}`);
    return response.data;
  },
  getBadges: async (userId: string): Promise<{ badges: ApiBadge[] }> => {
    const response = await api.get(`/quests/${userId}/badges`);
    return response.data;
  },
  getStats: async (userId: string): Promise<ApiQuestStats> => {
    const response = await api.get(`/quests/${userId}/stats`);
    return response.data;
  },
  checkBadges: async (userId: string): Promise<ApiBadgeCheckResult> => {
    const response = await api.post(`/quests/${userId}/check-badges`);
    return response.data;
  },
  getLeaderboard: async (scope: 'global' | 'friends' = 'global'): Promise<{ leaderboard: ApiLeaderboardEntry[] }> => {
    const response = await api.get(`/quests/leaderboard?scope=${scope}`);
    return response.data;
  },
};

// Social API
export interface PublicUserStats {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  quests_completed: number;
  badges_earned: number;
  badges_count?: number;
  is_followed_by_me?: boolean;
  is_following?: boolean;
}

export interface FollowUser {
  id: string;
  name: string;
  username?: string;
  avatar_url?: string;
  is_following?: boolean;
}

export const socialApi = {
  setMyUsername: async (username: string): Promise<{ user_id: string; username: string }> => {
    const response = await api.post('/user/me/username', { username });
    return response.data;
  },
  getPublicUserStats: async (userId: string): Promise<PublicUserStats> => {
    const response = await api.get(`/users/${userId}/public-stats`);
    return response.data;
  },
  searchUsers: async (query: string): Promise<{ results: FollowUser[] }> => {
    const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
    return response.data;
  },
  followUser: async (targetUserId: string): Promise<{ success: boolean }> => {
    const response = await api.post(`/users/${targetUserId}/follow`);
    return response.data;
  },
  unfollowUser: async (targetUserId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/users/${targetUserId}/follow`);
    return response.data;
  },
  getMyFollowing: async (): Promise<{ following: FollowUser[] }> => {
    const response = await api.get('/users/me/following');
    return response.data;
  },
  getMyFollowers: async (): Promise<{ followers: FollowUser[] }> => {
    const response = await api.get('/users/me/followers');
    return response.data;
  },
};

export default api;