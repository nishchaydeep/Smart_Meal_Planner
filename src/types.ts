export interface UserProfile {
  height: number; // in cm
  weight: number; // in kg
  age: number;
  sex: 'male' | 'female' | 'other';
  bmi: number;
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  dietaryRestrictions?: string[];
  allergies?: string[];
}

export interface Ingredient {
  name: string;
  amount?: number;
  unit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface Recipe {
  name: string;
  ingredients: Ingredient[];
  instructions?: string[];
  totalCalories: number;
  prepTime?: string;
  servings?: number;
  tags?: string[];
}

export interface UserBehavior {
  searchedIngredients: string[];
  viewedRecipes: string[];
  preferredCuisines: string[];
  calorieTargets: number[];
  timestamp: string;
}

