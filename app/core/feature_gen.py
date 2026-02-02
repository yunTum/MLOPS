import pandas as pd
import numpy as np
from itertools import combinations
from sklearn.feature_selection import VarianceThreshold
from sklearn.preprocessing import PolynomialFeatures

def _to_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Helper to convert object columns to numeric where possible."""
    df_out = df.copy()
    for col in df_out.columns:
        # Try converting to numeric, non-convertibles become NaN
        # If a column was purely string that can't be number, it becomes all NaN
        # We might want to keep original if it fails completely, but for "numeric_only" operations we want numbers.
        try:
             df_out[col] = pd.to_numeric(df_out[col], errors='coerce')
        except:
            pass
    return df_out

def generate_polynomial_features(df: pd.DataFrame, degree: int = 2, interaction_only: bool = False, include_cols: list = None) -> pd.DataFrame:
    """
    Generate polynomial and interaction features using sklearn.
    """
    df_out = _to_numeric(df)
    
    if include_cols:
        numeric_cols = [c for c in include_cols if c in df_out.select_dtypes(include=[np.number]).columns]
        df_work = df_out[numeric_cols].fillna(0) # Poly features doesn't like NaN
    else:
        numeric_df = df_out.select_dtypes(include=[np.number])
        numeric_cols = numeric_df.columns.tolist()
        df_work = numeric_df.fillna(0)
    
    if df_work.empty:
        return df_out

    # Use sklearn PolynomialFeatures
    poly = PolynomialFeatures(degree=degree, interaction_only=interaction_only, include_bias=False)
    
    # Fit Transform
    # Limit row count for very large datasets? Sklearn Poly can be memory intensive.
    # Assuming MLOps MVP dataset sizes are manageable or user accepts OOM risk for "auto gen".
    
    try:
        matrix = poly.fit_transform(df_work)
        feature_names = poly.get_feature_names_out(numeric_cols)
        
        # Create DataFrame
        # Clean names: "a b" -> "a_times_b", "a^2" -> "a_squared"
        clean_names = []
        for name in feature_names:
            clean = name.replace(" ", "_times_").replace("^2", "_squared").replace("^3", "_cubed")
            clean_names.append(clean)
            
        gen_df = pd.DataFrame(matrix, columns=clean_names, index=df_work.index)
        
        # Remove original columns if they are present (poly features includes them usually, but include_bias=False includes degree 1 terms)
        # We only want NEW features
        new_cols = [c for c in gen_df.columns if c not in numeric_cols]
        return gen_df[new_cols]
    except Exception as e:
        print(f"Polynomial generation failed: {e}")
        return pd.DataFrame(index=df.index)

def generate_arithmetic_features(df: pd.DataFrame, include_cols: list = None) -> pd.DataFrame:
    """
    Generate arithmetic combinations (add, sub, mul, div) for numeric columns.
    """
    df_out = _to_numeric(df)
    
    if include_cols:
        numeric_cols = [c for c in include_cols if c in df_out.select_dtypes(include=[np.number]).columns]
    else:
        numeric_cols = df_out.select_dtypes(include=[np.number]).columns.tolist()
        
    # Generate pairs
    for c1, c2 in combinations(numeric_cols, 2):
        # Addition
        df_out[f"{c1}_plus_{c2}"] = df_out[c1] + df_out[c2]
        # Subtraction
        df_out[f"{c1}_minus_{c2}"] = df_out[c1] - df_out[c2]
        # Multiplication
        df_out[f"{c1}_times_{c2}"] = df_out[c1] * df_out[c2]
        # Division (safe)
        # replace 0 with nan to avoid ZeroDivisionError (pandas handles this but produces inf slightly differently depending on version/engine)
        # We explicitly handle inf result just in case
        res = df_out[c1] / (df_out[c2].replace(0, np.nan))
        df_out[f"{c1}_div_{c2}"] = res.replace([np.inf, -np.inf], np.nan)
        
    return df_out

def generate_dfs_features(df: pd.DataFrame, include_cols: list = None) -> pd.DataFrame:
    """
    Generate features using Featuretools Deep Feature Synthesis (DFS).
    Focuses on single-table transformations.
    """
    import featuretools as ft
    
    # 1. Prepare Data
    df_work = _to_numeric(df)
    if include_cols:
         df_work = df_work[include_cols]
    
    # Ensure unique index
    if "index" not in df_work.columns:
        df_work = df_work.reset_index()
        df_work = df_work.rename(columns={"index": "ft_id"})
    
    # 2. EntitySet
    es = ft.EntitySet(id="dataset")
    es = es.add_dataframe(
        dataframe_name="data",
        dataframe=df_work,
        index="ft_id"
    )
    
    # 3. DFS
    # Restricted primitives to prevent combinatorial explosion (OOM) and overlap with Arithmetic Mode
    trans_primitives = ["natural_logarithm", "sine", "cosine"]
    # Note: sine/cosine good for finding cycles if strict numeric.
    
    feature_matrix, feature_defs = ft.dfs(
        entityset=es,
        target_dataframe_name="data",
        trans_primitives=trans_primitives,
        max_depth=1,
        verbose=True
    )
    
    # 4. Cleanup
    if "ft_id" in feature_matrix.columns:
        feature_matrix = feature_matrix.drop(columns=["ft_id"])
        
    return feature_matrix, feature_defs

def select_features(df: pd.DataFrame, 
                   variance_threshold: float = 0.0, 
                   correlation_threshold: float = 0.95) -> pd.DataFrame:
    """
    Select features based on variance and correlation.
    """
    df_out = _to_numeric(df)
    
    # Fill NAs for selection (variance/correlation don't like NaNs)
    # Simple strategy: mean fill
    numeric_df = df_out.select_dtypes(include=[np.number])
    if numeric_df.empty:
        # If no numeric columns, return original (or empty?)
        return df
        
    # Memory Optimization: Downcast to float32
    numeric_df = numeric_df.astype(np.float32)

    # Standardize Inf/NaN
    numeric_df = numeric_df.replace([np.inf, -np.inf], np.nan)
    numeric_df_filled = numeric_df.fillna(numeric_df.mean())
    
    # 1. Variance Threshold
    selector = VarianceThreshold(threshold=variance_threshold)
    # Check dimensions
    if numeric_df_filled.shape[1] == 0:
        return df_out

    selector.fit(numeric_df_filled)
    kept_indices = selector.get_support(indices=True)
    kept_cols = numeric_df.columns[kept_indices]
    
    # Drop low variance cols from numeric part, keep others (non-numeric usually kept)
    low_var_cols = set(numeric_df.columns) - set(kept_cols)
    df_out = df_out.drop(columns=list(low_var_cols))
    
    # 2. Correlation Filter (Remove highly correlated)
    # Re-evaluate numeric columns after variance drop
    numeric_df = df_out.select_dtypes(include=[np.number])
    if numeric_df.empty:
        return df_out

    numeric_df_filled = numeric_df.fillna(numeric_df.mean())
    corr_matrix = numeric_df_filled.corr().abs()
    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
    
    to_drop = [column for column in upper.columns if any(upper[column] > correlation_threshold)]
    
    df_out = df_out.drop(columns=to_drop)
    
    return df_out
