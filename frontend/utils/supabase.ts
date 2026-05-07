import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// On web (SSR), AsyncStorage references `window` which doesn't exist in Node.
// Pass undefined so Supabase falls back to in-memory storage for web.
const getStorage = () => (Platform.OS === 'web' ? undefined : AsyncStorage)

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
})
