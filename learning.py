# learning.py

import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score
import traceback # Added for more detailed error logging

MODEL_PATH = 'zenith_model.joblib'
VECTORIZER_PATH = 'zenith_vectorizer.joblib'

def extract_features(analysis_result):
    """Converts the complex analysis result into a flat dictionary of features for the model."""
    features = {}
    try:
        # Simple features: number of each type of level/zone found
        features['num_support'] = len(analysis_result.get('support', []))
        features['num_resistance'] = len(analysis_result.get('resistance', []))
        features['num_demand_zones'] = len(analysis_result.get('demand_zones', []))
        features['num_supply_zones'] = len(analysis_result.get('supply_zones', []))
        features['num_bullish_ob'] = len(analysis_result.get('bullish_ob', []))
        features['num_bearish_ob'] = len(analysis_result.get('bearish_ob', []))
        # Add FVG counts as potential features if desired
        features['num_bullish_fvg'] = len(analysis_result.get('bullish_fvg', []))
        features['num_bearish_fvg'] = len(analysis_result.get('bearish_fvg', []))

        # Categorical features from the suggestion
        suggestion = analysis_result.get('suggestion', {})
        features['action'] = suggestion.get('action', 'Neutral')
        # Consider making reason more structured or using keywords if it's important
        # features['reason_keyword'] = suggestion.get('reason', 'None').split(',')[0] # Example: take first part

        # Confidence level as a feature (might need encoding if categorical)
        features['confidence'] = analysis_result.get('confidence', 0) # Use numerical confidence

        # Market Structure
        features['market_structure'] = analysis_result.get('market_structure', ['Ranging'])[0] # Get the string 'Uptrend', 'Downtrend', 'Ranging'

    except Exception as e:
        print(f"Error extracting features: {e}")
        # Return an empty dict or default features if extraction fails
        return {}

    return features

def train_and_save_model(data):
    """Trains a classifier model and a vectorizer on historical trade data."""
    if len(data) < 10:
        return {"error": "Not enough data to train model. Minimum 10 trades required."}

    df = pd.DataFrame(data)

    if 'outcome' not in df.columns:
        return {"error": "Outcome column not found in training data."}
    if 'analysis_json' not in df.columns:
        return {"error": "analysis_json column not found in training data."}

    # Ensure outcome is numeric (handle potential None or other types)
    df['outcome'] = pd.to_numeric(df['outcome'], errors='coerce')
    df = df.dropna(subset=['outcome', 'analysis_json']) # Drop rows where outcome or analysis is missing
    df['outcome'] = df['outcome'].astype(int) # Ensure outcome is integer type

    # Extract features from the 'analysis_json' column
    # Handle potential errors during JSON parsing or feature extraction
    features_list = []
    for analysis_str in df['analysis_json']:
        try:
            analysis_dict = json.loads(analysis_str) if isinstance(analysis_str, str) else analysis_str
            features_list.append(extract_features(analysis_dict))
        except Exception as e:
            print(f"Skipping row due to error processing analysis_json: {e}")
            features_list.append(None) # Add a placeholder for rows with errors

    df['features'] = features_list
    df = df.dropna(subset=['features']) # Drop rows where feature extraction failed

    if df.empty:
        return {"error": "No valid data remaining after feature extraction."}

    X = df['features'].tolist()
    y = df['outcome']

    # Check if there's enough data after filtering
    if len(X) < 10:
        return {"error": f"Not enough valid data points ({len(X)}) to train model after filtering."}
    if len(y.unique()) < 2:
         return {"error": f"Only one outcome class ({y.unique()}) present in the training data. Cannot train model."}


    vectorizer = DictVectorizer(sparse=False)
    try:
        X_vec = vectorizer.fit_transform(X)
    except Exception as e:
        return {"error": f"Error during vectorization: {e}"}

    # Ensure stratification if classes are imbalanced, especially with small datasets
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X_vec, y, test_size=0.2, random_state=42, stratify=y if len(y.unique()) > 1 else None
        )
    except ValueError as e:
         # Handle potential stratification issues if one class has too few samples
         print(f"Stratification failed: {e}. Splitting without stratification.")
         X_train, X_test, y_train, y_test = train_test_split(X_vec, y, test_size=0.2, random_state=42)

    if len(X_train) == 0 or len(X_test) == 0:
        return {"error": "Train or test split resulted in zero samples."}

    model = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced') # Added class_weight for imbalance
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(vectorizer, VECTORIZER_PATH)

    print(f"Model trained with accuracy: {accuracy:.2f}")
    return {"message": "Model trained successfully!", "accuracy": accuracy}


def get_model_and_vectorizer():
    """Loads the saved model and vectorizer from disk."""
    try:
        model = joblib.load(MODEL_PATH)
        vectorizer = joblib.load(VECTORIZER_PATH)
        print("Model and vectorizer loaded successfully.")
        return model, vectorizer
    except FileNotFoundError:
        print("Model or vectorizer file not found.")
        return None, None
    except Exception as e:
        print(f"Error loading model/vectorizer: {e}")
        return None, None

def predict_success_rate(analysis_result, model, vectorizer):
    """Predicts the probability of success for a given analysis result."""
    if model is None or vectorizer is None:
        return "N/A (Model not loaded)"

    try:
        features = extract_features(analysis_result)
        if not features: # Handle case where feature extraction failed
             return "N/A (Feature extraction error)"

        # Important: Transform using the *loaded* vectorizer
        features_vec = vectorizer.transform([features])

        # Predict probability [prob_class_0, prob_class_1]
        probabilities = model.predict_proba(features_vec)

        # Assuming class 1 represents success (TP hit)
        success_prob = probabilities[0][1]

        return f"{success_prob * 100:.1f}%"

    except ValueError as e:
        # This often happens if the input features don't match the vectorizer's vocabulary
        print(f"Prediction ValueError: {e}")
        print("Features extracted:", features)
        # print("Vectorizer features:", vectorizer.feature_names_) # Uncomment to debug mismatch
        return "N/A (Feature mismatch)"
    except Exception as e:
        print(f"Error during prediction: {e}")
        traceback.print_exc() # Print full traceback for debugging
        return "N/A (Prediction error)"