import axios, { AxiosHeaders } from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

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
  hasFood: async (imageBase64: string, userId: string) => {
    const response = await api.post('/meals/has-food', {
      image_base64: imageBase64,
      user_id: userId,
    });
    return response.data;
  },
  voiceToMeal: async (audioUri: string, userId: string) => {
    const form = new FormData();
    form.append('user_id', userId);
    form.append('audio', {
      uri: audioUri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    } as any);

    const response = await api.post('/meals/voice-to-meal', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
    return response.data;
  },
  logPhoto: async (imageBase64: string, userId: string) => {
    const response = await api.post('/meals/log-photo', {
      image_base64: imageBase64,
      user_id: userId,
    });
    return response.data;
  },
  logMeal: async (mealData: any) => {
    const response = await api.post('/meals/log', mealData);
    return response.data;
  },
  getHistory: async (userId: string, days: number = 7) => {
    // Get timezone offset in minutes (e.g., IST = 330, EST = -300)
    const timezoneOffset = -new Date().getTimezoneOffset();
    const response = await api.get(`/meals/history/${userId}?days=${days}&timezone_offset=${timezoneOffset}`);
    return response.data;
  },
  getStats: async (userId: string, date?: string) => {
    // Get timezone offset in minutes
    const timezoneOffset = -new Date().getTimezoneOffset();
    const dateParam = date ? `date=${date}&` : '';
    const response = await api.get(`/meals/stats/${userId}?${dateParam}timezone_offset=${timezoneOffset}`);
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