import { UserProfile, UserBehavior } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '..', 'data');
const USER_PROFILE_FILE = path.join(STORAGE_DIR, 'user_profile.json');
const BEHAVIOR_FILE = path.join(STORAGE_DIR, 'user_behavior.json');

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating storage directory:', error);
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await ensureStorageDir();
  await fs.writeFile(USER_PROFILE_FILE, JSON.stringify(profile, null, 2));
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await fs.readFile(USER_PROFILE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export async function trackBehavior(behavior: Partial<UserBehavior>): Promise<void> {
  await ensureStorageDir();
  
  let existingBehavior: UserBehavior = {
    searchedIngredients: [],
    viewedRecipes: [],
    preferredCuisines: [],
    calorieTargets: [],
    timestamp: new Date().toISOString()
  };

  try {
    const data = await fs.readFile(BEHAVIOR_FILE, 'utf-8');
    existingBehavior = JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, use defaults
  }

  // Merge new behavior
  if (behavior.searchedIngredients) {
    existingBehavior.searchedIngredients.push(...behavior.searchedIngredients);
  }
  if (behavior.viewedRecipes) {
    existingBehavior.viewedRecipes.push(...behavior.viewedRecipes);
  }
  if (behavior.preferredCuisines) {
    existingBehavior.preferredCuisines.push(...behavior.preferredCuisines);
  }
  if (behavior.calorieTargets) {
    existingBehavior.calorieTargets.push(...behavior.calorieTargets);
  }
  
  existingBehavior.timestamp = new Date().toISOString();

  await fs.writeFile(BEHAVIOR_FILE, JSON.stringify(existingBehavior, null, 2));
}

export async function getUserBehavior(): Promise<UserBehavior | null> {
  try {
    const data = await fs.readFile(BEHAVIOR_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

