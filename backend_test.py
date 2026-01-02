#!/usr/bin/env python3
"""
NutriSnap Backend API Testing Suite
Tests all backend endpoints comprehensively
"""

import requests
import json
import base64
import uuid
from datetime import datetime, timedelta
import time

# Backend URL from frontend .env
BACKEND_URL = "https://snapmeal-5.preview.emergentagent.com/api"

class NutriSnapTester:
    def __init__(self):
        self.test_user_id = None
        self.test_results = []
        
    def log_test(self, test_name, success, details="", error=""):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if error:
            print(f"   Error: {error}")
        print()

    def test_user_onboarding(self):
        """Test POST /api/user/onboard"""
        print("=== Testing User Onboarding API ===")
        
        # Test with male user
        male_user_data = {
            "name": "Arjun Sharma",
            "age": 28,
            "gender": "male",
            "height": 175.0,
            "weight": 70.0,
            "goal": "lose_weight",
            "activity_level": "moderate",
            "dietary_preference": "vegetarian"
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/user/onboard", json=male_user_data, timeout=30)
            if response.status_code == 200:
                user_data = response.json()
                self.test_user_id = user_data["id"]
                
                # Verify BMR calculation (Mifflin-St Jeor for male)
                expected_bmr = (10 * 70) + (6.25 * 175) - (5 * 28) + 5  # 1663.75
                expected_tdee = expected_bmr * 1.55  # moderate activity
                expected_calories = expected_tdee - 500  # lose weight goal
                
                actual_calories = user_data["daily_calorie_target"]
                calorie_diff = abs(actual_calories - expected_calories)
                
                if calorie_diff < 5:  # Allow small rounding differences
                    self.log_test("User Onboarding - Male BMR Calculation", True, 
                                f"Calories: {actual_calories} (expected ~{expected_calories:.1f})")
                else:
                    self.log_test("User Onboarding - Male BMR Calculation", False, 
                                f"Calories: {actual_calories}, expected: {expected_calories:.1f}")
                
                # Verify macro split (40/30/30)
                protein_cals = user_data["protein_target"] * 4
                carbs_cals = user_data["carbs_target"] * 4
                fat_cals = user_data["fat_target"] * 9
                total_macro_cals = protein_cals + carbs_cals + fat_cals
                
                if abs(total_macro_cals - actual_calories) < 10:
                    self.log_test("User Onboarding - Macro Calculation", True,
                                f"P:{user_data['protein_target']:.1f}g C:{user_data['carbs_target']:.1f}g F:{user_data['fat_target']:.1f}g")
                else:
                    self.log_test("User Onboarding - Macro Calculation", False,
                                f"Macro calories don't match total: {total_macro_cals:.1f} vs {actual_calories}")
                    
            else:
                self.log_test("User Onboarding - Male", False, error=f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            self.log_test("User Onboarding - Male", False, error=str(e))
        
        # Test with female user
        female_user_data = {
            "name": "Priya Patel",
            "age": 25,
            "gender": "female",
            "height": 160.0,
            "weight": 55.0,
            "goal": "gain_muscle",
            "activity_level": "active",
            "dietary_preference": "non_veg"
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/user/onboard", json=female_user_data, timeout=30)
            if response.status_code == 200:
                user_data = response.json()
                
                # Verify BMR calculation (Mifflin-St Jeor for female)
                expected_bmr = (10 * 55) + (6.25 * 160) - (5 * 25) - 161  # 1264
                expected_tdee = expected_bmr * 1.725  # active
                expected_calories = expected_tdee + 300  # gain muscle goal
                
                actual_calories = user_data["daily_calorie_target"]
                calorie_diff = abs(actual_calories - expected_calories)
                
                if calorie_diff < 5:
                    self.log_test("User Onboarding - Female BMR Calculation", True,
                                f"Calories: {actual_calories} (expected ~{expected_calories:.1f})")
                else:
                    self.log_test("User Onboarding - Female BMR Calculation", False,
                                f"Calories: {actual_calories}, expected: {expected_calories:.1f}")
            else:
                self.log_test("User Onboarding - Female", False, error=f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("User Onboarding - Female", False, error=str(e))

    def test_user_retrieval(self):
        """Test GET /api/user/{user_id}"""
        print("=== Testing User Retrieval API ===")
        
        if not self.test_user_id:
            self.log_test("User Retrieval", False, error="No test user ID available")
            return
            
        try:
            response = requests.get(f"{BACKEND_URL}/user/{self.test_user_id}", timeout=30)
            if response.status_code == 200:
                user_data = response.json()
                if user_data["id"] == self.test_user_id and user_data["name"] == "Arjun Sharma":
                    self.log_test("User Retrieval", True, f"Retrieved user: {user_data['name']}")
                else:
                    self.log_test("User Retrieval", False, "User data mismatch")
            else:
                self.log_test("User Retrieval", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("User Retrieval", False, error=str(e))

    def test_goal_updates(self):
        """Test PUT /api/user/{user_id}/goals"""
        print("=== Testing Goal Updates API ===")
        
        if not self.test_user_id:
            self.log_test("Goal Updates", False, error="No test user ID available")
            return
            
        try:
            # Update goal to maintain weight
            params = {"goal": "maintain", "activity_level": "light"}
            response = requests.put(f"{BACKEND_URL}/user/{self.test_user_id}/goals", params=params, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "targets" in result and "message" in result:
                    self.log_test("Goal Updates", True, f"Updated to maintain weight: {result['targets']['daily_calorie_target']} calories")
                else:
                    self.log_test("Goal Updates", False, "Missing targets or message in response")
            else:
                self.log_test("Goal Updates", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Goal Updates", False, error=str(e))

    def test_food_search(self):
        """Test GET /api/foods/search"""
        print("=== Testing Food Search API ===")
        
        # Test basic search
        try:
            response = requests.get(f"{BACKEND_URL}/foods/search?query=dal", timeout=30)
            if response.status_code == 200:
                data = response.json()
                if data["count"] > 0 and any("dal" in food["name"].lower() for food in data["foods"]):
                    self.log_test("Food Search - Basic Query", True, f"Found {data['count']} dal items")
                else:
                    self.log_test("Food Search - Basic Query", False, "No dal items found")
            else:
                self.log_test("Food Search - Basic Query", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Food Search - Basic Query", False, error=str(e))
        
        # Test category filter
        try:
            response = requests.get(f"{BACKEND_URL}/foods/search?category=north_indian", timeout=30)
            if response.status_code == 200:
                data = response.json()
                if data["count"] > 0 and all(food["category"] == "north_indian" for food in data["foods"]):
                    self.log_test("Food Search - Category Filter", True, f"Found {data['count']} north indian items")
                else:
                    self.log_test("Food Search - Category Filter", False, "Category filter not working")
            else:
                self.log_test("Food Search - Category Filter", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Food Search - Category Filter", False, error=str(e))
        
        # Test vegetarian filter
        try:
            response = requests.get(f"{BACKEND_URL}/foods/search?vegetarian_only=true", timeout=30)
            if response.status_code == 200:
                data = response.json()
                if data["count"] > 0 and all(food["is_vegetarian"] for food in data["foods"]):
                    self.log_test("Food Search - Vegetarian Filter", True, f"Found {data['count']} vegetarian items")
                else:
                    self.log_test("Food Search - Vegetarian Filter", False, "Vegetarian filter not working")
            else:
                self.log_test("Food Search - Vegetarian Filter", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Food Search - Vegetarian Filter", False, error=str(e))

    def test_food_categories(self):
        """Test GET /api/foods/categories"""
        print("=== Testing Food Categories API ===")
        
        try:
            response = requests.get(f"{BACKEND_URL}/foods/categories", timeout=30)
            if response.status_code == 200:
                data = response.json()
                expected_categories = {"north_indian", "south_indian", "street_food"}
                actual_categories = set(data["categories"])
                
                if expected_categories.issubset(actual_categories):
                    self.log_test("Food Categories", True, f"Categories: {data['categories']}")
                else:
                    self.log_test("Food Categories", False, f"Missing categories. Got: {data['categories']}")
            else:
                self.log_test("Food Categories", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Food Categories", False, error=str(e))

    def test_meal_logging(self):
        """Test POST /api/meals/log"""
        print("=== Testing Meal Logging API ===")
        
        if not self.test_user_id:
            self.log_test("Meal Logging", False, error="No test user ID available")
            return
        
        # Test breakfast meal
        meal_data = {
            "user_id": self.test_user_id,
            "meal_type": "breakfast",
            "foods": [
                {
                    "name": "Idli",
                    "quantity": 120,  # 3 idlis
                    "calories": 69.6,
                    "protein": 2.4,
                    "carbs": 13.2,
                    "fat": 0.48
                },
                {
                    "name": "Sambar",
                    "quantity": 200,
                    "calories": 144,
                    "protein": 6,
                    "carbs": 24,
                    "fat": 3
                }
            ],
            "logging_method": "manual",
            "notes": "Test breakfast meal"
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/meals/log", json=meal_data, timeout=30)
            if response.status_code == 200:
                meal_log = response.json()
                expected_calories = 69.6 + 144  # 213.6
                
                if abs(meal_log["total_calories"] - expected_calories) < 0.1:
                    self.log_test("Meal Logging - Breakfast", True, 
                                f"Logged meal: {meal_log['total_calories']} calories")
                else:
                    self.log_test("Meal Logging - Breakfast", False, 
                                f"Calorie calculation wrong: {meal_log['total_calories']} vs {expected_calories}")
            else:
                self.log_test("Meal Logging - Breakfast", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Meal Logging - Breakfast", False, error=str(e))
        
        # Test lunch meal
        lunch_data = {
            "user_id": self.test_user_id,
            "meal_type": "lunch",
            "foods": [
                {
                    "name": "Dal Makhani",
                    "quantity": 200,
                    "calories": 280,
                    "protein": 14,
                    "carbs": 24,
                    "fat": 16
                },
                {
                    "name": "Roti",
                    "quantity": 80,  # 2 rotis
                    "calories": 208,
                    "protein": 6.4,
                    "carbs": 40,
                    "fat": 2.4
                }
            ],
            "logging_method": "manual"
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/meals/log", json=lunch_data, timeout=30)
            if response.status_code == 200:
                self.log_test("Meal Logging - Lunch", True, "Lunch meal logged successfully")
            else:
                self.log_test("Meal Logging - Lunch", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Meal Logging - Lunch", False, error=str(e))

    def test_meal_history(self):
        """Test GET /api/meals/history/{user_id}"""
        print("=== Testing Meal History API ===")
        
        if not self.test_user_id:
            self.log_test("Meal History", False, error="No test user ID available")
            return
        
        try:
            response = requests.get(f"{BACKEND_URL}/meals/history/{self.test_user_id}?days=7", timeout=30)
            if response.status_code == 200:
                data = response.json()
                if "meals" in data and "count" in data:
                    if data["count"] >= 2:  # Should have breakfast and lunch from previous tests
                        self.log_test("Meal History", True, f"Retrieved {data['count']} meals")
                    else:
                        self.log_test("Meal History", False, f"Expected at least 2 meals, got {data['count']}")
                else:
                    self.log_test("Meal History", False, "Missing meals or count in response")
            else:
                self.log_test("Meal History", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Meal History", False, error=str(e))

    def test_daily_stats(self):
        """Test GET /api/meals/stats/{user_id}"""
        print("=== Testing Daily Stats API ===")
        
        if not self.test_user_id:
            self.log_test("Daily Stats", False, error="No test user ID available")
            return
        
        try:
            response = requests.get(f"{BACKEND_URL}/meals/stats/{self.test_user_id}", timeout=30)
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_calories", "total_protein", "total_carbs", "total_fat", "targets", "meals_logged"]
                
                if all(field in data for field in required_fields):
                    expected_calories = 213.6 + 488  # breakfast + lunch = 701.6
                    actual_calories = data["total_calories"]
                    
                    if abs(actual_calories - expected_calories) < 5:
                        self.log_test("Daily Stats", True, 
                                    f"Stats: {actual_calories} calories from {data['meals_logged']} meals")
                    else:
                        self.log_test("Daily Stats", False, 
                                    f"Calorie total wrong: {actual_calories} vs expected ~{expected_calories}")
                else:
                    missing = [f for f in required_fields if f not in data]
                    self.log_test("Daily Stats", False, f"Missing fields: {missing}")
            else:
                self.log_test("Daily Stats", False, error=f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Daily Stats", False, error=str(e))

    def test_voice_logging(self):
        """Test POST /api/meals/log-voice"""
        print("=== Testing Voice Logging API ===")
        
        if not self.test_user_id:
            self.log_test("Voice Logging", False, error="No test user ID available")
            return
        
        voice_data = {
            "text": "I had 2 rotis and dal for dinner",
            "user_id": self.test_user_id,
            "meal_type": "dinner"
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/meals/log-voice", json=voice_data, timeout=60)
            if response.status_code == 200:
                data = response.json()
                if "foods" in data and len(data["foods"]) > 0:
                    foods_found = [f["name"] for f in data["foods"]]
                    self.log_test("Voice Logging", True, f"Parsed foods: {foods_found}")
                else:
                    self.log_test("Voice Logging", False, "No foods parsed from voice input")
            else:
                self.log_test("Voice Logging", False, error=f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Voice Logging", False, error=str(e))

    def test_photo_analysis(self):
        """Test POST /api/meals/log-photo"""
        print("=== Testing Photo Analysis API ===")
        
        if not self.test_user_id:
            self.log_test("Photo Analysis", False, error="No test user ID available")
            return
        
        # Create a simple test image (1x1 pixel PNG in base64)
        # This is a minimal valid PNG image
        test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        photo_data = {
            "image_base64": test_image_b64,
            "user_id": self.test_user_id
        }
        
        try:
            response = requests.post(f"{BACKEND_URL}/meals/log-photo", json=photo_data, timeout=60)
            if response.status_code == 200:
                data = response.json()
                if "foods" in data:
                    self.log_test("Photo Analysis", True, f"API responded with foods array (length: {len(data['foods'])})")
                else:
                    self.log_test("Photo Analysis", False, "Missing foods in response")
            else:
                self.log_test("Photo Analysis", False, error=f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Photo Analysis", False, error=str(e))

    def run_all_tests(self):
        """Run all backend tests"""
        print("🧪 Starting NutriSnap Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        # Test in logical order
        self.test_user_onboarding()
        self.test_user_retrieval()
        self.test_goal_updates()
        self.test_food_search()
        self.test_food_categories()
        self.test_meal_logging()
        self.test_meal_history()
        self.test_daily_stats()
        self.test_voice_logging()
        self.test_photo_analysis()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        print("\n🔍 DETAILED RESULTS:")
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}")
            if result["error"]:
                print(f"   Error: {result['error']}")
        
        return self.test_results

if __name__ == "__main__":
    tester = NutriSnapTester()
    results = tester.run_all_tests()