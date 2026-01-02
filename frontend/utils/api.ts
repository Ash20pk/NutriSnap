import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// User API
export const userApi = {
  onboard: async (userData: any) => {
    const response = await api.post('/user/onboard', userData);
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
  logVoice: async (text: string, userId: string, mealType: string) => {
    const response = await api.post('/meals/log-voice', {
      text,
      user_id: userId,
      meal_type: mealType,
    });
    return response.data;
  },
  getHistory: async (userId: string, days: number = 7) => {
    const response = await api.get(`/meals/history/${userId}`, {
      params: { days },
    });
    return response.data;
  },
  getStats: async (userId: string, date?: string) => {
    const response = await api.get(`/meals/stats/${userId}`, {
      params: date ? { date } : {},
    });
    return response.data;
  },
};

export default api;