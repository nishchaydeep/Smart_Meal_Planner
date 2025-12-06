import { askGroq } from './groq-client.js';
import { UserProfile, UserBehavior, Recipe } from './types.js';
import { getUserProfile, getUserBehavior } from './storage.js';

export async function suggestRecipes(preferences?: string): Promise<string> {
  const userProfile = await getUserProfile();
  const userBehavior = await getUserBehavior();
  
  let systemPrompt = 'You are a professional chef and nutritionist. Suggest healthy, practical recipes.';
  let userPrompt = preferences || 'Suggest 3 delicious and healthy recipes.';
  
  // Personalize based on user profile
  if (userProfile) {
    const { bmi, age, sex, activityLevel, dietaryRestrictions, allergies } = userProfile;
    
    let bmiCategory = 'normal';
    if (bmi < 18.5) bmiCategory = 'underweight';
    else if (bmi >= 25 && bmi < 30) bmiCategory = 'overweight';
    else if (bmi >= 30) bmiCategory = 'obese';
    
    const dailyCalories = calculateDailyCalories(userProfile);
    
    systemPrompt += `\n\nUser Profile:
- BMI: ${bmi.toFixed(1)} (${bmiCategory})
- Age: ${age}, Sex: ${sex}
- Estimated daily calorie needs: ${dailyCalories} kcal
- Activity level: ${activityLevel || 'moderate'}`;
    
    if (dietaryRestrictions && dietaryRestrictions.length > 0) {
      systemPrompt += `\n- Dietary restrictions: ${dietaryRestrictions.join(', ')}`;
    }
    
    if (allergies && allergies.length > 0) {
      systemPrompt += `\n- Allergies: ${allergies.join(', ')}`;
    }
    
    userPrompt += `\n\nTailor the recipes to fit my daily calorie target of ${dailyCalories} kcal.`;
  }
  
  // Personalize based on behavior
  if (userBehavior) {
    const { searchedIngredients, viewedRecipes, preferredCuisines } = userBehavior;
    
    if (searchedIngredients.length > 0) {
      const recentIngredients = [...new Set(searchedIngredients.slice(-10))];
      userPrompt += `\n\nI've recently searched for these ingredients: ${recentIngredients.join(', ')}. Consider incorporating some of them.`;
    }
    
    if (preferredCuisines.length > 0) {
      const cuisines = [...new Set(preferredCuisines)];
      userPrompt += `\n\nI enjoy ${cuisines.join(', ')} cuisine.`;
    }
  }
  
  userPrompt += `\n\nFor each recipe, provide:
1. Recipe name
2. Ingredients list with amounts
3. Step-by-step instructions
4. Estimated calories per serving
5. Prep time

Format the response in a clear, easy-to-read manner.`;
  
  const response = await askGroq(userPrompt, systemPrompt);
  return response;
}

export async function generateMealPlan(days: number = 7, preferences?: string): Promise<string> {
  const userProfile = await getUserProfile();
  const userBehavior = await getUserBehavior();
  
  let systemPrompt = 'You are a professional nutritionist creating personalized meal plans.';
  let userPrompt = `Create a ${days}-day meal plan with breakfast, lunch, dinner, and snacks.`;
  
  if (userProfile) {
    const dailyCalories = calculateDailyCalories(userProfile);
    const { bmi, dietaryRestrictions, allergies } = userProfile;
    
    systemPrompt += `\n\nUser's daily calorie target: ${dailyCalories} kcal
BMI: ${bmi.toFixed(1)}`;
    
    if (dietaryRestrictions && dietaryRestrictions.length > 0) {
      systemPrompt += `\nDietary restrictions: ${dietaryRestrictions.join(', ')}`;
    }
    
    if (allergies && allergies.length > 0) {
      systemPrompt += `\nAllergies: ${allergies.join(', ')}`;
    }
    
    userPrompt += `\n\nEnsure each day totals approximately ${dailyCalories} kcal.`;
  }
  
  if (preferences) {
    userPrompt += `\n\nAdditional preferences: ${preferences}`;
  }
  
  if (userBehavior?.preferredCuisines && userBehavior.preferredCuisines.length > 0) {
    const cuisines = [...new Set(userBehavior.preferredCuisines)];
    userPrompt += `\n\nIncorporate ${cuisines.join(', ')} cuisine where appropriate.`;
  }
  
  userPrompt += `\n\nFor each meal, include:
- Meal name
- Main ingredients
- Estimated calories
- Brief preparation notes

Format as a clear day-by-day plan.`;
  
  const response = await askGroq(userPrompt, systemPrompt);
  return response;
}

function calculateDailyCalories(profile: UserProfile): number {
  // Mifflin-St Jeor Equation
  let bmr: number;
  
  if (profile.sex === 'male') {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
  } else if (profile.sex === 'female') {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
  } else {
    // Average for other
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 78;
  }
  
  // Activity multiplier
  const activityMultipliers = {
    'sedentary': 1.2,
    'light': 1.375,
    'moderate': 1.55,
    'active': 1.725,
    'very_active': 1.9,
  };
  
  const multiplier = activityMultipliers[profile.activityLevel || 'moderate'];
  return Math.round(bmr * multiplier);
}

