#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import Groq from "groq-sdk";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Groq client
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY environment variable is not set. Please add it to your .env file.');
}

const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

// Data storage paths
const DATA_DIR = path.join(process.cwd(), "data");
const USER_PROFILE_PATH = path.join(DATA_DIR, "user_profile.json");
const SEARCH_HISTORY_PATH = path.join(DATA_DIR, "search_history.json");
const MEAL_HISTORY_PATH = path.join(DATA_DIR, "meal_history.json");

// Interfaces
interface UserProfile {
  height: number; // in cm
  weight: number; // in kg
  age: number;
  sex: "male" | "female" | "other";
  bmi?: number;
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  dietaryPreferences?: string[];
  allergies?: string[];
}

interface SearchHistory {
  timestamp: string;
  query: string;
  type: "ingredient" | "recipe";
}

interface MealHistory {
  timestamp: string;
  recipe: string;
  ingredients: string[];
  totalCalories?: number;
}

// Utility functions
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating data directory:", error);
  }
}

async function loadUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await fs.readFile(USER_PROFILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveUserProfile(profile: UserProfile): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));
}

async function loadSearchHistory(): Promise<SearchHistory[]> {
  try {
    const data = await fs.readFile(SEARCH_HISTORY_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addSearchHistory(entry: SearchHistory): Promise<void> {
  await ensureDataDir();
  const history = await loadSearchHistory();
  history.push(entry);
  // Keep only last 100 searches
  const trimmed = history.slice(-100);
  await fs.writeFile(SEARCH_HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

async function loadMealHistory(): Promise<MealHistory[]> {
  try {
    const data = await fs.readFile(MEAL_HISTORY_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addMealHistory(entry: MealHistory): Promise<void> {
  await ensureDataDir();
  const history = await loadMealHistory();
  history.push(entry);
  // Keep only last 50 meals
  const trimmed = history.slice(-50);
  await fs.writeFile(MEAL_HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

function calculateBMI(weight: number, height: number): number {
  // BMI = weight(kg) / (height(m))^2
  const heightInMeters = height / 100;
  return parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(2));
}

function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

function calculateDailyCalories(profile: UserProfile): number {
  // Using Mifflin-St Jeor Equation
  let bmr: number;
  
  if (profile.sex === "male") {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
  } else {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
  }

  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  const multiplier = activityMultipliers[profile.activityLevel || "moderate"];
  return Math.round(bmr * multiplier);
}

// AI-powered functions using Groq
async function searchIngredients(query: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a nutrition expert. When given an ingredient query, provide detailed information about the ingredient(s) including:
- Name of the ingredient
- Common uses
- Nutritional highlights
- Storage tips
- Substitutes (if applicable)

Format your response in a clear, structured way.`,
      },
      {
        role: "user",
        content: `Search for information about: ${query}`,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
    max_tokens: 1024,
  });

  await addSearchHistory({
    timestamp: new Date().toISOString(),
    query,
    type: "ingredient",
  });

  return completion.choices[0]?.message?.content || "No information found.";
}

async function getCalorieInfo(ingredient: string, amount?: string): Promise<string> {
  const amountText = amount ? `${amount} of` : "100g of";
  
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a nutrition database. Provide accurate calorie and macronutrient information for food items.
Include:
- Calories
- Protein (g)
- Carbohydrates (g)
- Fat (g)
- Fiber (g)
- Any notable vitamins/minerals

Be specific with the serving size. If amount is not specified, use 100g as default.`,
      },
      {
        role: "user",
        content: `What are the calories and nutritional info for ${amountText} ${ingredient}?`,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 512,
  });

  return completion.choices[0]?.message?.content || "Nutritional information not available.";
}

async function suggestRecipes(userProfile: UserProfile): Promise<string> {
  const searchHistory = await loadSearchHistory();
  const mealHistory = await loadMealHistory();
  
  const recentIngredients = searchHistory
    .filter((s) => s.type === "ingredient")
    .slice(-10)
    .map((s) => s.query);
  
  const recentMeals = mealHistory.slice(-10).map((m) => m.recipe);
  
  const dailyCalories = calculateDailyCalories(userProfile);
  const bmiCategory = getBMICategory(userProfile.bmi || 0);

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a professional nutritionist and chef. Create personalized recipe suggestions based on user profile and behavior.`,
      },
      {
        role: "user",
        content: `Create 3 recipe suggestions for a user with the following profile:

User Profile:
- Age: ${userProfile.age}
- Sex: ${userProfile.sex}
- Height: ${userProfile.height}cm
- Weight: ${userProfile.weight}kg
- BMI: ${userProfile.bmi} (${bmiCategory})
- Daily calorie target: ${dailyCalories} kcal
- Activity level: ${userProfile.activityLevel || "moderate"}
${userProfile.dietaryPreferences?.length ? `- Dietary preferences: ${userProfile.dietaryPreferences.join(", ")}` : ""}
${userProfile.allergies?.length ? `- Allergies: ${userProfile.allergies.join(", ")}` : ""}

Recent ingredient searches: ${recentIngredients.length ? recentIngredients.join(", ") : "None"}
Recent meals: ${recentMeals.length ? recentMeals.join(", ") : "None"}

For each recipe provide:
1. Recipe name
2. Estimated calories per serving
3. Ingredients list
4. Brief cooking instructions
5. Why this recipe suits the user's profile

Make the suggestions diverse and nutritionally balanced.`,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.8,
    max_tokens: 2048,
  });

  await addSearchHistory({
    timestamp: new Date().toISOString(),
    query: "recipe suggestions",
    type: "recipe",
  });

  return completion.choices[0]?.message?.content || "Unable to generate recipe suggestions.";
}

// MCP Server setup
const server = new Server(
  {
    name: "recipe-meal-planner",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools: Tool[] = [
  {
    name: "set_user_profile",
    description: "Set or update user profile information (height, weight, age, sex) and calculate BMI. This information is used for personalized meal planning.",
    inputSchema: {
      type: "object",
      properties: {
        height: {
          type: "number",
          description: "Height in centimeters",
        },
        weight: {
          type: "number",
          description: "Weight in kilograms",
        },
        age: {
          type: "number",
          description: "Age in years",
        },
        sex: {
          type: "string",
          enum: ["male", "female", "other"],
          description: "Biological sex for BMI calculation",
        },
        activityLevel: {
          type: "string",
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
          description: "Activity level for calorie calculation (optional)",
        },
        dietaryPreferences: {
          type: "array",
          items: { type: "string" },
          description: "Dietary preferences like vegetarian, vegan, keto, etc. (optional)",
        },
        allergies: {
          type: "array",
          items: { type: "string" },
          description: "Food allergies or intolerances (optional)",
        },
      },
      required: ["height", "weight", "age", "sex"],
    },
  },
  {
    name: "get_user_profile",
    description: "Retrieve stored user profile including BMI and daily calorie requirements",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_ingredient",
    description: "Search for detailed information about an ingredient including nutritional highlights, uses, and storage tips",
    inputSchema: {
      type: "object",
      properties: {
        ingredient: {
          type: "string",
          description: "The ingredient to search for (e.g., 'chicken breast', 'spinach', 'quinoa')",
        },
      },
      required: ["ingredient"],
    },
  },
  {
    name: "get_calorie_info",
    description: "Get detailed calorie and macronutrient information for a specific ingredient",
    inputSchema: {
      type: "object",
      properties: {
        ingredient: {
          type: "string",
          description: "The ingredient to get calorie info for",
        },
        amount: {
          type: "string",
          description: "Amount/serving size (e.g., '1 cup', '200g'). Defaults to 100g if not specified",
        },
      },
      required: ["ingredient"],
    },
  },
  {
    name: "suggest_recipes",
    description: "Get personalized recipe suggestions based on user profile, search history, and meal history. Requires user profile to be set first.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "log_meal",
    description: "Log a meal to track eating patterns and improve future recipe suggestions",
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "string",
          description: "Name of the recipe/meal",
        },
        ingredients: {
          type: "array",
          items: { type: "string" },
          description: "List of ingredients used",
        },
        totalCalories: {
          type: "number",
          description: "Total calories in the meal (optional)",
        },
      },
      required: ["recipe", "ingredients"],
    },
  },
  {
    name: "get_meal_history",
    description: "Retrieve recent meal history to track eating patterns",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent meals to retrieve (default: 10)",
        },
      },
    },
  },
];

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      throw new Error("Missing arguments");
    }

    switch (name) {
      case "set_user_profile": {
        const profile: UserProfile = {
          height: args.height as number,
          weight: args.weight as number,
          age: args.age as number,
          sex: args.sex as "male" | "female" | "other",
          activityLevel: args.activityLevel as UserProfile["activityLevel"],
          dietaryPreferences: args.dietaryPreferences as string[],
          allergies: args.allergies as string[],
        };
        
        profile.bmi = calculateBMI(profile.weight, profile.height);
        await saveUserProfile(profile);
        
        const dailyCalories = calculateDailyCalories(profile);
        const bmiCategory = getBMICategory(profile.bmi);
        
        return {
          content: [
            {
              type: "text",
              text: `User profile saved successfully!

Profile Summary:
- Height: ${profile.height}cm
- Weight: ${profile.weight}kg
- Age: ${profile.age} years
- Sex: ${profile.sex}
- BMI: ${profile.bmi} (${bmiCategory})
- Daily Calorie Target: ~${dailyCalories} kcal
- Activity Level: ${profile.activityLevel || "moderate"}
${profile.dietaryPreferences?.length ? `- Dietary Preferences: ${profile.dietaryPreferences.join(", ")}` : ""}
${profile.allergies?.length ? `- Allergies: ${profile.allergies.join(", ")}` : ""}

You can now get personalized recipe suggestions!`,
            },
          ],
        };
      }

      case "get_user_profile": {
        const profile = await loadUserProfile();
        if (!profile) {
          return {
            content: [
              {
                type: "text",
                text: "No user profile found. Please set your profile first using set_user_profile.",
              },
            ],
          };
        }
        
        const dailyCalories = calculateDailyCalories(profile);
        const bmiCategory = getBMICategory(profile.bmi || 0);
        
        return {
          content: [
            {
              type: "text",
              text: `Current User Profile:

- Height: ${profile.height}cm
- Weight: ${profile.weight}kg
- Age: ${profile.age} years
- Sex: ${profile.sex}
- BMI: ${profile.bmi} (${bmiCategory})
- Daily Calorie Target: ~${dailyCalories} kcal
- Activity Level: ${profile.activityLevel || "moderate"}
${profile.dietaryPreferences?.length ? `- Dietary Preferences: ${profile.dietaryPreferences.join(", ")}` : ""}
${profile.allergies?.length ? `- Allergies: ${profile.allergies.join(", ")}` : ""}`,
            },
          ],
        };
      }

      case "search_ingredient": {
        const ingredient = args.ingredient as string;
        const result = await searchIngredients(ingredient);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "get_calorie_info": {
        const ingredient = args.ingredient as string;
        const amount = args.amount as string | undefined;
        const result = await getCalorieInfo(ingredient, amount);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "suggest_recipes": {
        const profile = await loadUserProfile();
        if (!profile) {
          return {
            content: [
              {
                type: "text",
                text: "Please set your user profile first using set_user_profile to get personalized recipe suggestions.",
              },
            ],
          };
        }
        
        const result = await suggestRecipes(profile);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "log_meal": {
        const entry: MealHistory = {
          timestamp: new Date().toISOString(),
          recipe: args.recipe as string,
          ingredients: args.ingredients as string[],
          totalCalories: args.totalCalories as number | undefined,
        };
        
        await addMealHistory(entry);
        
        return {
          content: [
            {
              type: "text",
              text: `Meal logged successfully!

Recipe: ${entry.recipe}
Ingredients: ${entry.ingredients.join(", ")}
${entry.totalCalories ? `Total Calories: ${entry.totalCalories} kcal` : ""}
Logged at: ${new Date(entry.timestamp).toLocaleString()}

This will help improve your personalized recipe suggestions!`,
            },
          ],
        };
      }

      case "get_meal_history": {
        const limit = (args.limit as number) || 10;
        const history = await loadMealHistory();
        const recent = history.slice(-limit).reverse();
        
        if (recent.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No meal history found. Start logging your meals with log_meal!",
              },
            ],
          };
        }
        
        const formatted = recent.map((meal, idx) => 
          `${idx + 1}. ${meal.recipe} (${new Date(meal.timestamp).toLocaleDateString()})
   Ingredients: ${meal.ingredients.join(", ")}
   ${meal.totalCalories ? `Calories: ${meal.totalCalories} kcal` : ""}`
        ).join("\n\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Recent Meal History (last ${recent.length} meals):\n\n${formatted}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  await ensureDataDir();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("Recipe Meal Planner MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

