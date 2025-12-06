// API Base URL
const API_URL = 'http://localhost:3000/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    loadMealHistory();

    // Form handlers
    document.getElementById('profile-form').addEventListener('submit', saveProfile);
    document.getElementById('meal-form').addEventListener('submit', logMeal);
});

// Show/hide loading spinner
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // Add active class to clicked button
    event.target.classList.add('active');

    // Load data if needed
    if (tabName === 'meals') {
        loadMealHistory();
    }
}

// Profile Management
async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/profile`);
        const data = await response.json();

        if (data.success && data.profile) {
            displayProfile(data.profile);
        } else {
            showProfileForm();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showProfileForm();
    }
}

function displayProfile(profile) {
    document.getElementById('display-bmi').textContent = profile.bmi;
    document.getElementById('display-bmi-category').textContent = profile.bmiCategory;
    document.getElementById('display-calories').textContent = profile.dailyCalories;
    document.getElementById('display-activity').textContent = formatActivity(profile.activityLevel);

    document.getElementById('profile-display').classList.remove('hidden');
    document.getElementById('profile-form').classList.add('hidden');
}

function showProfileForm() {
    document.getElementById('profile-display').classList.add('hidden');
    document.getElementById('profile-form').classList.remove('hidden');
}

function formatActivity(level) {
    const map = {
        sedentary: 'Sedentary',
        light: 'Light',
        moderate: 'Moderate',
        active: 'Active',
        very_active: 'Very Active'
    };
    return map[level] || level;
}

async function saveProfile(e) {
    e.preventDefault();
    showLoading();

    const profile = {
        height: parseFloat(document.getElementById('height').value),
        weight: parseFloat(document.getElementById('weight').value),
        age: parseInt(document.getElementById('age').value),
        sex: document.getElementById('sex').value,
        activityLevel: document.getElementById('activityLevel').value,
        dietaryPreferences: document.getElementById('dietaryPreferences').value
            .split(',')
            .map(s => s.trim())
            .filter(s => s),
        allergies: document.getElementById('allergies').value
            .split(',')
            .map(s => s.trim())
            .filter(s => s)
    };

    try {
        const response = await fetch(`${API_URL}/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });

        const data = await response.json();

        if (data.success) {
            displayProfile(data.profile);
            alert('✅ Profile saved successfully!');
        } else {
            alert('❌ Error saving profile: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Ingredient Search
async function searchIngredient() {
    const ingredient = document.getElementById('ingredient-search').value.trim();
    if (!ingredient) {
        alert('Please enter an ingredient name');
        return;
    }

    showLoading();
    document.getElementById('amount-group').style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/ingredient/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredient })
        });

        const data = await response.json();

        if (data.success) {
            const resultBox = document.getElementById('ingredient-result');
            resultBox.innerHTML = `<div style="white-space: pre-wrap;">${data.data}</div>`;
            resultBox.classList.remove('hidden');
        } else {
            alert('❌ Error: ' + (data.message || data.error));
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function getCalories() {
    const ingredient = document.getElementById('ingredient-search').value.trim();
    if (!ingredient) {
        alert('Please enter an ingredient name');
        return;
    }

    // Show amount input
    document.getElementById('amount-group').style.display = 'block';
    const amount = document.getElementById('amount').value.trim();

    showLoading();

    try {
        const response = await fetch(`${API_URL}/ingredient/calories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredient, amount })
        });

        const data = await response.json();

        if (data.success) {
            const resultBox = document.getElementById('ingredient-result');
            resultBox.innerHTML = `<div style="white-space: pre-wrap;">${data.data}</div>`;
            resultBox.classList.remove('hidden');
        } else {
            alert('❌ Error: ' + (data.message || data.error));
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Recipe Suggestions
async function suggestRecipes() {
    showLoading();

    try {
        const response = await fetch(`${API_URL}/recipes/suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            const resultBox = document.getElementById('recipes-result');
            resultBox.innerHTML = `<div style="white-space: pre-wrap;">${data.data}</div>`;
            resultBox.classList.remove('hidden');

            // Show meal logging section
            document.getElementById('log-meal-section').classList.remove('hidden');
        } else {
            alert('❌ ' + (data.message || data.error));
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Meal Logging
async function logMeal(e) {
    e.preventDefault();
    showLoading();

    const meal = {
        recipe: document.getElementById('meal-recipe').value.trim(),
        ingredients: document.getElementById('meal-ingredients').value
            .split(',')
            .map(s => s.trim())
            .filter(s => s),
        totalCalories: parseInt(document.getElementById('meal-calories').value) || undefined
    };

    try {
        const response = await fetch(`${API_URL}/meals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meal)
        });

        const data = await response.json();

        if (data.success) {
            alert('✅ Meal logged successfully!');
            document.getElementById('meal-form').reset();
            loadMealHistory();
        } else {
            alert('❌ Error: ' + (data.message || data.error));
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Meal History
async function loadMealHistory() {
    try {
        const response = await fetch(`${API_URL}/meals?limit=10`);
        const data = await response.json();

        const resultBox = document.getElementById('meals-result');

        if (data.success && data.meals.length > 0) {
            resultBox.innerHTML = data.meals.map(meal => `
                <div class="meal-item">
                    <h4>${meal.recipe}</h4>
                    <p><strong>Ingredients:</strong> ${meal.ingredients.join(', ')}</p>
                    ${meal.totalCalories ? `<p><strong>Calories:</strong> ${meal.totalCalories} kcal</p>` : ''}
                    <p class="meal-date">${new Date(meal.timestamp).toLocaleString()}</p>
                </div>
            `).join('');
        } else {
            resultBox.innerHTML = '<p class="info-text">No meals logged yet. Start tracking your meals in the Recipes tab!</p>';
        }
    } catch (error) {
        console.error('Error loading meal history:', error);
        document.getElementById('meals-result').innerHTML = '<p class="info-text">Error loading meal history</p>';
    }
}

