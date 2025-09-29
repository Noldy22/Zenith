# learning.py

import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score

MODEL_PATH = 'zenith_model.joblib'
VECTORIZER_PATH = 'zenith_vectorizer.joblib'

def extract_features(analysis_result):
    """Converts the complex analysis result into a flat dictionary of features for the model."""
    features = {}
    
    # Simple features: number of each type of level/zone found
    features['num_support'] = len(analysis_result.get('support', []))
    features['num_resistance'] = len(analysis_result.get('resistance', []))
    features['num_demand_zones'] = len(analysis_result.get('demand_zones', []))
    features['num_supply_zones'] = len(analysis_result.get('supply_zones', []))
    features['num_bullish_ob'] = len(analysis_result.get('bullish_ob', []))
    features['num_bearish_ob'] = len(analysis_result.get('bearish_ob', []))
    
    # Categorical features from the suggestion
    suggestion = analysis_result.get('suggestion', {})
    features['action'] = suggestion.get('action', 'Neutral')
    features['reason'] = suggestion.get('reason', 'None')
    
    # Confidence level as a feature
    features['confidence'] = analysis_result.get('confidence', 'Low')
    
    return features

def train_and_save_model(data):
    """Trains a classifier model and a vectorizer on historical trade data."""
    if len(data) < 10:
        return {"error": "Not enough data to train model. Minimum 10 trades required."}

    df = pd.DataFrame(data)
    
    # Assume 'outcome' column is 1 for success (TP hit), 0 for failure (SL hit)
    # This is a simplification; in reality, you'd define this based on P/L
    if 'outcome' not in df.columns:
        return {"error": "Outcome column not found in training data."}

    # Extract features from the 'analysis_json' column
    df['features'] = df['analysis_json'].apply(extract_features)
    
    X = df['features'].tolist()
    y = df['outcome']

    # Use DictVectorizer to one-hot encode our categorical features
    vectorizer = DictVectorizer(sparse=False)
    X_vec = vectorizer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X_vec, y, test_size=0.2, random_state=42)

    # Use a RandomForestClassifier as our model
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate the model
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    # Save the trained model and vectorizer to disk
    joblib.dump(model, MODEL_PATH)
    joblib.dump(vectorizer, VECTORIZER_PATH)
    
    print(f"Model trained with accuracy: {accuracy:.2f}")
    return {"message": "Model trained successfully!", "accuracy": accuracy}

def get_model_and_vectorizer():
    """Loads the saved model and vectorizer from disk."""
    try:
        model = joblib.load(MODEL_PATH)
        vectorizer = joblib.load(VECTORIZER_PATH)
        return model, vectorizer
    except FileNotFoundError:
        return None, None