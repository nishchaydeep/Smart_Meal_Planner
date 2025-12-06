import { askGroq } from './groq-client.js';
import { Ingredient } from './types.js';

// Nutritional database (basic items - can be extended)
const NUTRITION_DB: Record<string, { calories: number; protein: number; carbs: number; fat: number; unit: string }> = {
  'chicken breast': { calories: 165, protein: 31, carbs: 0, fat: 3.6, unit: '100g' },
  'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, unit: '100g' },
  'broccoli': { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, unit: '100g' },
  'egg': { calories: 155, protein: 13, carbs: 1.1, fat: 11, unit: '100g' },
  'salmon': { calories: 208, protein: 20, carbs: 0, fat: 13, unit: '100g' },
  'potato': { calories: 77, protein: 2, carbs: 17, fat: 0.1, unit: '100g' },
  'tomato': { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, unit: '100g' },
  'onion': { calories: 40, protein: 1.1, carbs: 9, fat: 0.1, unit: '100g' },
  'garlic': { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, unit: '100g' },
  'olive oil': { calories: 884, protein: 0, carbs: 0, fat: 100, unit: '100ml' },
  'banana': { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, unit: '100g' },
  'apple': { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, unit: '100g' },
  'milk': { calories: 42, protein: 3.4, carbs: 5, fat: 1, unit: '100ml' },
  'cheese': { calories: 402, protein: 25, carbs: 1.3, fat: 33, unit: '100g' },
  'bread': { calories: 265, protein: 9, carbs: 49, fat: 3.2, unit: '100g' },
  'pasta': { calories: 131, protein: 5, carbs: 25, fat: 1.1, unit: '100g' },
  'beef': { calories: 250, protein: 26, carbs: 0, fat: 15, unit: '100g' },
  'carrot': { calories: 41, protein: 0.9, carbs: 10, fat: 0.2, unit: '100g' },
  'spinach': { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, unit: '100g' },
  'beans': { calories: 127, protein: 8.7, carbs: 23, fat: 0.5, unit: '100g' },
};

export async function searchIngredients(query: string): Promise<string[]> {
  const lowerQuery = query.toLowerCase();
  
  // Search in local database
  const localMatches = Object.keys(NUTRITION_DB)
    .filter(ingredient => ingredient.includes(lowerQuery));
  
  if (localMatches.length > 0) {
    return localMatches;
  }
  
  // Use Groq AI for more intelligent search
  const prompt = `Given the search query: "${query}", list 5-10 common food ingredients that match or are related to this query. 
Return only the ingredient names, one per line, in lowercase. Be specific and practical.`;
  
  const response = await askGroq(prompt, 'You are a culinary expert helping users find ingredients.');
  
  const ingredients = response
    .split('\n')
    .map(line => line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, ''))
    .filter(line => line.length > 0 && line.length < 50)
    .slice(0, 10);
  
  return ingredients;
}

export async function getCalorieInfo(ingredient: string, amount?: number, unit?: string): Promise<Ingredient> {
  const lowerIngredient = ingredient.toLowerCase();
  
  // Check local database first
  if (NUTRITION_DB[lowerIngredient]) {
    const info = NUTRITION_DB[lowerIngredient];
    const multiplier = amount && unit ? calculateMultiplier(amount, unit, info.unit) : 1;
    
    return {
      name: ingredient,
      amount,
      unit,
      calories: Math.round(info.calories * multiplier),
      protein: Math.round(info.protein * multiplier * 10) / 10,
      carbs: Math.round(info.carbs * multiplier * 10) / 10,
      fat: Math.round(info.fat * multiplier * 10) / 10,
    };
  }
  
  // Use Groq AI for unknown ingredients
  const amountStr = amount && unit ? `${amount}${unit}` : '100g';
  const prompt = `Provide nutritional information for ${amountStr} of ${ingredient}.
Return the data in this exact JSON format:
{
  "calories": <number>,
  "protein": <number in grams>,
  "carbs": <number in grams>,
  "fat": <number in grams>
}

Only return the JSON object, no additional text.`;
  
  try {
    const response = await askGroq(prompt, 'You are a nutrition expert. Provide accurate nutritional data.');
    
    // Try to parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        name: ingredient,
        amount,
        unit,
        calories: Math.round(data.calories),
        protein: Math.round(data.protein * 10) / 10,
        carbs: Math.round(data.carbs * 10) / 10,
        fat: Math.round(data.fat * 10) / 10,
      };
    }
  } catch (error) {
    console.error('Error parsing calorie info:', error);
  }
  
  // Fallback
  return {
    name: ingredient,
    amount,
    unit,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
}

function calculateMultiplier(amount: number, unit: string, baseUnit: string): number {
  // Simple unit conversion (can be expanded)
  const normalizedUnit = unit.toLowerCase();
  const normalizedBase = baseUnit.toLowerCase();
  
  if (normalizedUnit === normalizedBase) {
    return amount / 100; // Most entries are per 100g/ml
  }
  
  // Convert common units to grams
  const toGrams: Record<string, number> = {
    'kg': 1000,
    'g': 1,
    'mg': 0.001,
    'lb': 453.592,
    'oz': 28.3495,
    'ml': 1,
    'l': 1000,
    'cup': 240,
    'tbsp': 15,
    'tsp': 5,
  };
  
  const amountInGrams = amount * (toGrams[normalizedUnit] || 1);
  return amountInGrams / 100;
}

