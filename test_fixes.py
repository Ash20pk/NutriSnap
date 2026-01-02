#!/usr/bin/env python3
"""
Quick test for the fixed meal history and AI endpoints
"""

import requests
import json

BACKEND_URL = "https://design-preview-49.preview.emergentagent.com/api"
TEST_USER_ID = "686c41c1-21a5-450a-9c48-e2117ac8f9dc"

def test_meal_history():
    """Test the fixed meal history endpoint"""
    print("=== Testing Fixed Meal History API ===")
    try:
        response = requests.get(f"{BACKEND_URL}/meals/history/{TEST_USER_ID}?days=7", timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS Meal History - Found {data['count']} meals")
            return True
        else:
            print(f"❌ FAIL Meal History - Status: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL Meal History - Error: {str(e)}")
        return False

def test_voice_logging():
    """Test voice logging (will fail due to invalid API key)"""
    print("=== Testing Voice Logging API ===")
    voice_data = {
        "text": "I had 2 rotis and dal for dinner",
        "user_id": TEST_USER_ID,
        "meal_type": "dinner"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/meals/log-voice", json=voice_data, timeout=60)
        if response.status_code == 200:
            print("✅ PASS Voice Logging")
            return True
        else:
            print(f"❌ FAIL Voice Logging - Status: {response.status_code}")
            if "401" in response.text or "invalid_api_key" in response.text:
                print("   Issue: Invalid OpenAI API key (sk-emergent... is not valid)")
            return False
    except Exception as e:
        print(f"❌ FAIL Voice Logging - Error: {str(e)}")
        return False

def test_photo_analysis():
    """Test photo analysis (will fail due to invalid API key)"""
    print("=== Testing Photo Analysis API ===")
    test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    
    photo_data = {
        "image_base64": test_image_b64,
        "user_id": TEST_USER_ID
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/meals/log-photo", json=photo_data, timeout=60)
        if response.status_code == 200:
            print("✅ PASS Photo Analysis")
            return True
        else:
            print(f"❌ FAIL Photo Analysis - Status: {response.status_code}")
            if "401" in response.text or "invalid_api_key" in response.text:
                print("   Issue: Invalid OpenAI API key (sk-emergent... is not valid)")
            return False
    except Exception as e:
        print(f"❌ FAIL Photo Analysis - Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("🔧 Testing Fixed Issues")
    print("=" * 50)
    
    results = []
    results.append(test_meal_history())
    results.append(test_voice_logging())
    results.append(test_photo_analysis())
    
    print("\n📊 SUMMARY")
    print("=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if results[0]:
        print("✅ Meal History API - FIXED")
    if not results[1]:
        print("❌ Voice Logging API - OpenAI API key issue")
    if not results[2]:
        print("❌ Photo Analysis API - OpenAI API key issue")