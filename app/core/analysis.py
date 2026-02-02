import pandas as pd
import numpy as np
from sklearn.feature_selection import mutual_info_regression, mutual_info_classif

def calculate_relevance(df: pd.DataFrame, target_col: str, task_type: str = "regression") -> pd.DataFrame:
    """
    Calculate relevance of features to the target column using multiple metrics.
    """
    if target_col not in df.columns:
        raise ValueError(f"Target column {target_col} not found")
    
    # Convert to numeric
    for col in df.columns:
        try:
             df[col] = pd.to_numeric(df[col], errors='coerce')
        except:
            pass
            
    # Drop rows where target is NaN (can't train/analyze)
    df = df.dropna(subset=[target_col])
    
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    # 1. Pearson Correlation (Linear)
    # Only for numeric columns
    numeric_df = X.select_dtypes(include=[np.number])
    if numeric_df.empty:
        return pd.DataFrame() # No numeric features to analyze

    # Drop constant columns (std=0) to avoid divide by zero warnings and useless calculation
    numeric_df = numeric_df.loc[:, numeric_df.std() > 0]
    if numeric_df.empty:
        return pd.DataFrame()
        
    correlations = numeric_df.corrwith(y)
    
    # 2. Spearman Correlation (Monotonic)
    spearman = numeric_df.corrwith(y, method="spearman")
    
    # 3. Mutual Information (Non-linear)
    # Handle categorical for MI? For now just numeric or use simple encoding if needed.
    # We stick to numeric X for simplicity in MVP.
    numeric_filled = numeric_df.fillna(0)
    if task_type == "classification":
        # Ensure y is int/cat for classification
        y_int = y.astype(int)
        mi = mutual_info_classif(numeric_filled, y_int)
    else:
        mi = mutual_info_regression(numeric_filled, y)
        
    mi_series = pd.Series(mi, index=numeric_filled.columns)
    
    results = pd.DataFrame({
        "pearson": correlations,
        "spearman": spearman,
        "mutual_info": mi_series
    })
    
    return results

def detect_leakage(relevance_df: pd.DataFrame, threshold: float = 0.99) -> list:
    """
    Detect suspicious features that might be leaks (extremely high correlation).
    """
    leaks = []
    # Check absolute pearson/spearman
    if "pearson" in relevance_df.columns:
        leaks.extend(relevance_df[relevance_df["pearson"].abs() > threshold].index.tolist())
    
    if "spearman" in relevance_df.columns:
        leaks.extend(relevance_df[relevance_df["spearman"].abs() > threshold].index.tolist())
        
    return list(set(leaks))
