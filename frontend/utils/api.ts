import axios, { AxiosHeaders } from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

const USE_MOCK_DATA =
  __DEV__ &&
  (() => {
    const raw =
      Constants.expoConfig?.extra?.EXPO_PUBLIC_USE_MOCK_DATA ??
      process.env.EXPO_PUBLIC_USE_MOCK_DATA;
    if (raw === true) return true;
    if (typeof raw === 'string') return raw.toLowerCase() === 'true';
    return false;
  })();

const getMockProfile = (id: string) => ({
  id,
  name: 'Alex',
  age: 24,
  gender: 'male',
  height: 175,
  weight: 72,
  goal: 'lose_weight',
  activity_level: 'moderate',
  dietary_preference: 'balanced',
  daily_calorie_target: 2000,
  protein_target: 150,
  carbs_target: 220,
  fat_target: 65,
  onboarding_completed: true,
});

const getMockStats = () => ({
  total_calories: 1450,
  total_protein: 112,
  total_carbs: 158,
  total_fat: 48,
  meals_logged: 3,
  targets: {
    calories: 2000,
    protein: 150,
    carbs: 220,
    fat: 65,
  },
});

const getMockHistory = () => {
  const meals = Array.from({ length: 7 }).map((_, i) => {
    const dayOffset = 6 - i;
    const timestamp = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString();
    const total_calories = [1600, 1200, 1900, 1400, 1750, 900, 1500][i] ?? 0;
    const total_protein = [120, 90, 140, 110, 130, 70, 115][i] ?? 0;
    const total_carbs = [180, 140, 210, 160, 200, 110, 175][i] ?? 0;
    const total_fat = [55, 40, 60, 45, 58, 32, 50][i] ?? 0;
    
    // Mock foods with "hidden" label data
    const foods = [
      { 
        name: i % 2 === 0 ? 'Double Cheeseburger' : 'Grilled Chicken Salad', 
        calories: 500, 
        protein: 25, 
        carbs: 40, 
        fat: 30,
        sugar: i % 2 === 0 ? 12 : 2,
        sodium: i % 2 === 0 ? 1200 : 400,
        trans_fat: i % 2 === 0 ? 1.5 : 0,
        saturated_fat: i % 2 === 0 ? 15 : 2,
        timestamp 
      },
      { 
        name: i % 3 === 0 ? 'Diet Soda (Red 40)' : 'Protein Bar', 
        calories: 200, 
        protein: 15, 
        carbs: 20, 
        fat: 8,
        sugar: i % 3 === 0 ? 0 : 18,
        sodium: 150,
        trans_fat: 0,
        saturated_fat: 3,
        timestamp
      }
    ];

    return {
      id: `mock-meal-${i + 1}`,
      timestamp,
      total_calories,
      total_protein,
      total_carbs,
      total_fat,
      foods,
      meal_type: i % 3 === 0 ? 'breakfast' : i % 3 === 1 ? 'lunch' : 'dinner'
    };
  });

  return { meals };
};

console.log('[API] Resolved API_URL:', API_URL);

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

    // Only ever send Supabase session access_token (prevents sending Apple ES256 identity tokens).
    const headers = AxiosHeaders.from(request.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.delete('Authorization');
      delete api.defaults.headers.common.Authorization;
    }

    request.headers = headers;
    console.log('[API Request]', {
      method: request.method?.toUpperCase(),
      url: `${request.baseURL ?? ''}${request.url ?? ''}`,
      data: request.data,
      params: request.params,
      hasAuth: !!token,
    });
    return request;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response logging
api.interceptors.response.use(
  (response) => {
    console.log('[API Response]', {
      status: response.status,
      url: response.config.url,
      data: response.data,
    });
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const requestUrl = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`;
    const isExpectedMissingProfile =
      status === 404 && (error.config?.url === '/user/me' || requestUrl.endsWith('/api/user/me'));

    if (!isExpectedMissingProfile) {
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
  onboard: async (userData: any) => {
    const response = await api.post('/user/onboard', userData);
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/user/me');
    return response.data;
  },
  getUser: async (userId: string) => {
    if (USE_MOCK_DATA) {
      return getMockProfile(userId);
    }
    const response = await api.get(`/user/${userId}`);
    return response.data;
  },
  updateGoals: async (userId: string, goal: string, activityLevel: string) => {
    const response = await api.put(`/user/${userId}/goals`, { goal, activity_level: activityLevel });
    return response.data;
  },
};

// Food API
export const foodApi = {
  searchFoods: async (query: string = '', category: string = '', vegetarianOnly: boolean = false) => {
    const response = await api.get('/foods/search', {
      params: { query, category, vegetarian_only: vegetarianOnly },
    });
    return response.data;
  },
  getCategories: async () => {
    const response = await api.get('/foods/categories');
    return response.data;
  },
};

// Meal API
export const mealApi = {
  logPhoto: async (imageBase64: string, userId: string) => {
    if (USE_MOCK_DATA) {
      void imageBase64;
      return {
        id: `mock-photo-${Date.now()}`,
        user_id: userId,
        created_at: new Date().toISOString(),
        foods: [],
        total_calories: 520,
        total_protein: 35,
        total_carbs: 40,
        total_fat: 22,
      };
    }
    const response = await api.post('/meals/log-photo', {
      image_base64: imageBase64,
      user_id: userId,
    });
    return response.data;
  },
  logMeal: async (mealData: any) => {
    if (USE_MOCK_DATA) {
      return {
        id: `mock-meal-${Date.now()}`,
        ...mealData,
        created_at: new Date().toISOString(),
      };
    }
    const response = await api.post('/meals/log', mealData);
    return response.data;
  },
  logVoice: async (text: string, userId: string, mealType: string) => {
    if (USE_MOCK_DATA) {
      void text;
      return {
        id: `mock-voice-${Date.now()}`,
        user_id: userId,
        meal_type: mealType,
        created_at: new Date().toISOString(),
        foods: [],
      };
    }
    const response = await api.post('/meals/log-voice', {
      text,
      user_id: userId,
      meal_type: mealType,
    });
    return response.data;
  },
  getHistory: async (userId: string, days: number = 7) => {
    if (USE_MOCK_DATA) {
      void userId;
      void days;
      return getMockHistory();
    }
    const response = await api.get(`/meals/history/${userId}`, {
      params: { days },
    });
    return response.data;
  },
  getStats: async (userId: string, date?: string) => {
    if (USE_MOCK_DATA) {
      void userId;
      void date;
      return getMockStats();
    }
    const response = await api.get(`/meals/stats/${userId}`, {
      params: date ? { date } : {},
    });
    return response.data;
  },
};

// Chef API
export const chefApi = {
  generate: async (prompt: string) => {
    const response = await api.post('/chef/generate', { prompt });
    return response.data;
  },
};

export default api;