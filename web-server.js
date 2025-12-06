#!/usr/bin/env node

/**
 * Web Server for Recipe & Meal Planner
 * Provides HTTP API wrapper around the MCP functionality
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import Groq from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Initialize Groq client
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY environment variable is not set. Please add it to your .env file.');
}

const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

// Data paths
const DATA_DIR = join(__dirname, 'data');
const USER_PROFILE_PATH = join(DATA_DIR, 'user_profile.json');
const SEARCH_HISTORY_PATH = join(DATA_DIR, 'search_history.json');
const MEAL_HISTORY_PATH = join(DATA_DIR, 'meal_history.json');

// Utility functions
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

async function loadUserProfile() {
  try {
    const data = await fs.readFile(USER_PROFILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveUserProfile(profile) {
  await ensureDataDir();
  await fs.writeFile(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));
}

async function loadSearchHistory() {
  try {
    const data = await fs.readFile(SEARCH_HISTORY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addSearchHistory(entry) {
  await ensureDataDir();
  const history = await loadSearchHistory();
  history.push(entry);
  const trimmed = history.slice(-100);
  await fs.writeFile(SEARCH_HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

async function loadMealHistory() {
  try {
    const data = await fs.readFile(MEAL_HISTORY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addMealHistory(entry) {
  await ensureDataDir();
  const history = await loadMealHistory();
  history.push(entry);
  const trimmed = history.slice(-50);
  await fs.writeFile(MEAL_HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

function calculateBMI(weight, height) {
  const heightInMeters = height / 100;
  return parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(2));
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

function calculateDailyCalories(profile) {
  let bmr;
  
  if (profile.sex === 'male') {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
  } else {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
  }

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  const multiplier = activityMultipliers[profile.activityLevel || 'moderate'];
  return Math.round(bmr * multiplier);
}

// API Routes

// Set user profile
app.post('/api/profile', async (req, res) => {
  try {
    const { height, weight, age, sex, activityLevel, dietaryPreferences, allergies } = req.body;
    
    const profile = {
      height,
      weight,
      age,
      sex,
      activityLevel: activityLevel || 'moderate',
      dietaryPreferences: dietaryPreferences || [],
      allergies: allergies || [],
    };
    
    profile.bmi = calculateBMI(weight, height);
    profile.dailyCalories = calculateDailyCalories(profile);
    profile.bmiCategory = getBMICategory(profile.bmi);
    
    await saveUserProfile(profile);
    
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user profile
app.get('/api/profile', async (req, res) => {
  try {
    const profile = await loadUserProfile();
    if (!profile) {
      return res.json({ success: false, message: 'No profile found' });
    }
    
    // Recalculate in case formulas changed
    profile.dailyCalories = calculateDailyCalories(profile);
    profile.bmiCategory = getBMICategory(profile.bmi);
    
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search ingredient
app.post('/api/ingredient/search', async (req, res) => {
  try {
    const { ingredient } = req.body;
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a nutrition expert. Provide detailed information about ingredients including nutritional highlights, common uses, storage tips, and substitutes. Format your response in a clear, structured way.`,
        },
        {
          role: 'user',
          content: `Search for information about: ${ingredient}`,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
    });

    await addSearchHistory({
      timestamp: new Date().toISOString(),
      query: ingredient,
      type: 'ingredient',
    });

    res.json({ 
      success: true, 
      data: completion.choices[0]?.message?.content || 'No information found.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get calorie info
app.post('/api/ingredient/calories', async (req, res) => {
  try {
    const { ingredient, amount } = req.body;
    const amountText = amount ? `${amount} of` : '100g of';
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a nutrition database. Provide accurate calorie and macronutrient information for food items. Include calories, protein, carbs, fat, fiber, and notable vitamins/minerals. Be specific with serving size.`,
        },
        {
          role: 'user',
          content: `What are the calories and nutritional info for ${amountText} ${ingredient}?`,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 512,
    });

    res.json({ 
      success: true, 
      data: completion.choices[0]?.message?.content || 'Nutritional information not available.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Suggest recipes
app.post('/api/recipes/suggest', async (req, res) => {
  try {
    const profile = await loadUserProfile();
    if (!profile) {
      return res.json({ success: false, message: 'Please set your profile first' });
    }

    const searchHistory = await loadSearchHistory();
    const mealHistory = await loadMealHistory();
    
    const recentIngredients = searchHistory
      .filter((s) => s.type === 'ingredient')
      .slice(-10)
      .map((s) => s.query);
    
    const recentMeals = mealHistory.slice(-10).map((m) => m.recipe);
    
    const dailyCalories = calculateDailyCalories(profile);
    const bmiCategory = getBMICategory(profile.bmi || 0);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a professional nutritionist and chef. Create personalized recipe suggestions based on user profile and behavior.`,
        },
        {
          role: 'user',
          content: `Create 3 recipe suggestions for a user with the following profile:

User Profile:
- Age: ${profile.age}
- Sex: ${profile.sex}
- Height: ${profile.height}cm
- Weight: ${profile.weight}kg
- BMI: ${profile.bmi} (${bmiCategory})
- Daily calorie target: ${dailyCalories} kcal
- Activity level: ${profile.activityLevel || 'moderate'}
${profile.dietaryPreferences?.length ? `- Dietary preferences: ${profile.dietaryPreferences.join(', ')}` : ''}
${profile.allergies?.length ? `- Allergies: ${profile.allergies.join(', ')}` : ''}

Recent ingredient searches: ${recentIngredients.length ? recentIngredients.join(', ') : 'None'}
Recent meals: ${recentMeals.length ? recentMeals.join(', ') : 'None'}

For each recipe provide:
1. Recipe name
2. Estimated calories per serving
3. Ingredients list
4. Brief cooking instructions
5. Why this recipe suits the user's profile

Make the suggestions diverse and nutritionally balanced.`,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 2048,
    });

    await addSearchHistory({
      timestamp: new Date().toISOString(),
      query: 'recipe suggestions',
      type: 'recipe',
    });

    res.json({ 
      success: true, 
      data: completion.choices[0]?.message?.content || 'Unable to generate recipe suggestions.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Log meal
app.post('/api/meals', async (req, res) => {
  try {
    const { recipe, ingredients, totalCalories } = req.body;
    
    const entry = {
      timestamp: new Date().toISOString(),
      recipe,
      ingredients,
      totalCalories,
    };
    
    await addMealHistory(entry);
    
    res.json({ success: true, meal: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get meal history
app.get('/api/meals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await loadMealHistory();
    const recent = history.slice(-limit).reverse();
    
    res.json({ success: true, meals: recent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
(async () => {
  await ensureDataDir();

  app.listen(PORT, () => {
    console.log(`🍽️  Recipe & Meal Planner Web Server running!`);
    console.log(`📱 Open your browser to: http://localhost:${PORT}`);
    console.log(`🔧 API available at: http://localhost:${PORT}/api`);
  });
})();

