import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from app.db import models
from app.schemas import feature as schemas
from app.core import storage
import uuid
import os

FEATURE_ROOT = "data/features"

import joblib

def apply_transformations(df: pd.DataFrame, transformations: list, fitted_transformers: dict = None) -> tuple[pd.DataFrame, dict]:
    """
    Apply a list of transformations to the dataframe.
    If fitted_transformers is None (Training), fit_transform and return new transformers.
    If fitted_transformers is provided (Inference), use transform.
    """
    # Imports for transformations
    from sklearn.preprocessing import StandardScaler, MinMaxScaler, OneHotEncoder
    import category_encoders as ce

    def _ensure_sortable(df_in, col_name):
        """Helper to ensure sort column is numeric or datetime"""
        if col_name not in df_in.columns:
            return df_in
        
        # If already numeric or datetime, return
        if pd.api.types.is_numeric_dtype(df_in[col_name]) or pd.api.types.is_datetime64_any_dtype(df_in[col_name]):
            return df_in
            
        # Try converting to numeric first (e.g. year/month as string)
        try:
            # We don't want to convert "2021-01-01" to numbers typically, unless they are simple ints
            # But pd.to_numeric handles "1", "2" well.
            # If it raises or turns specific strings to NaN, we backup to datetime
            # Actually, safe approach: copy column
            temp_col = pd.to_numeric(df_in[col_name], errors='raise')
            df_out = df_in.copy()
            df_out[col_name] = temp_col
            return df_out
        except:
             pass
             
        # Try datetime
        try:
            temp_col = pd.to_datetime(df_in[col_name], errors='raise')
            df_out = df_in.copy()
            df_out[col_name] = temp_col
            return df_out
        except:
            pass
            
        return df_in

    df_out = df.copy()
    
    # Dictionary to store new fitted transformers if we are in training mode
    new_transformers = {} 
    is_training = fitted_transformers is None
    
    # Use provided transformers if available, otherwise we will populate new_transformers
    transformers_to_use = fitted_transformers if not is_training else new_transformers

    for t in (transformations or []):
        op = t.get("op")
        col = t.get("col")
        if "new_col" in t:
            new_col = t["new_col"]
        else:
            if op == "lag":
                new_col = f"{col}_lag_{t.get('periods', 1)}"
            elif op == "diff":
                new_col = f"{col}_diff_{t.get('periods', 1)}"
            elif op == "rolling":
                new_col = f"{col}_rolling_{t.get('window', 3)}_{t.get('func', 'mean')}"
            else:
                new_col = f"{col}_{op}" if col else None
        
        # Unique key for this transformation step
        # Prefer ID from builder
        trans_key = t.get("id") or f"{col}_{op}_{new_col}" 

        # --- Auto Generation ---
        if op == "auto_gen":
            from app.core import feature_gen
            method = t.get("method", "arithmetic")
            source_cols = t.get("source_columns")
            target_col = t.get("target_column")
            
            # Prepare Source DF
            if source_cols:
                # Filter to source columns
                temp_df = df_out[source_cols].copy()
            else:
                # Default: Drop target column if it exists in DF
                if target_col and target_col in df_out.columns:
                    temp_df = df_out.drop(columns=[target_col])
                else:
                    temp_df = df_out.copy()
            
            gen_df = pd.DataFrame(index=df_out.index) # Initialize
            
            if method == "featuretools":
                import featuretools as ft
                if is_training:
                    # Train: Generate and store definitions
                    gen_df, defs = feature_gen.generate_dfs_features(temp_df)
                    new_transformers[trans_key] = defs
                elif trans_key in transformers_to_use:
                    # Inference: Use stored definitions
                    defs = transformers_to_use[trans_key]
                    
                    # Prepare for Inference (Numeric + Index)
                    temp_df_num = feature_gen._to_numeric(temp_df)
                    # We need an index for EntitySet
                    if "ft_id" not in temp_df_num.columns:
                         temp_df_num = temp_df_num.reset_index(drop=True)
                         temp_df_num["ft_id"] = temp_df_num.index
                    
                    es = ft.EntitySet(id="dataset_inf")
                    es = es.add_dataframe(dataframe_name="data", dataframe=temp_df_num, index="ft_id")
                    
                    try:
                        gen_df = ft.calculate_feature_matrix(features=defs, entityset=es)
                        if "ft_id" in gen_df.columns: gen_df = gen_df.drop(columns=["ft_id"])
                        gen_df.index = df_out.index 
                    except Exception as e:
                         print(f"Warning: DFS Inference failed: {e}")
                else:
                     print(f"Warning: DFS definitions missing for {trans_key}, skipping.")

            elif method == "arithmetic":
                # Arithmetic is deterministic/stateless
                gen_df = feature_gen.generate_arithmetic_features(temp_df)

            elif method == "polynomial":
                degree = int(t.get("degree", 2))
                interaction_only = t.get("interaction_only", False)
                gen_df = feature_gen.generate_polynomial_features(temp_df, degree=degree, interaction_only=interaction_only)
            
            # --- Selection ---
            var_thresh = float(t.get("variance_threshold", 0.0))
            corr_thresh = float(t.get("correlation_threshold", 1.0))
            
            sel_key = f"{trans_key}_selection"
            if is_training:
                # Select features
                gen_df = feature_gen.select_features(gen_df, var_thresh, corr_thresh)
                new_transformers[sel_key] = gen_df.columns.tolist()
            elif sel_key in transformers_to_use:
                # Inference select
                kept_cols = transformers_to_use[sel_key]
                gen_df = gen_df.reindex(columns=kept_cols, fill_value=0)

            # Join new columns
            new_cols = gen_df.columns.difference(df_out.columns)
            if not new_cols.empty:
                # Reindex safely
                gen_df = gen_df.reindex(df_out.index)
                df_out = pd.concat([df_out, gen_df[new_cols]], axis=1)

        # --- Basic ---
        elif op == "log":
            if col in df_out.columns:
                df_out[new_col] = np.log1p(df_out[col])
                
        elif op == "fillna":
            val = t.get("value", 0)
            try:
                val = float(val)
                if val.is_integer(): val = int(val)
            except (ValueError, TypeError):
                pass
            if col in df_out.columns:
                df_out[col] = df_out[col].fillna(val)
                
        elif op == "onehot":
            if col in df_out.columns:
                # Stateful OneHot
                if trans_key in transformers_to_use:
                    enc = transformers_to_use[trans_key]
                    # Transform
                    # handle_unknown='ignore' prevents error on new categories
                    matrix = enc.transform(df_out[[col]])
                    feature_names = enc.get_feature_names_out([col])
                    df_encoded = pd.DataFrame(matrix, columns=feature_names, index=df_out.index)
                    df_out = pd.concat([df_out, df_encoded], axis=1)
                elif is_training:
                    # Fit
                    enc = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
                    matrix = enc.fit_transform(df_out[[col]])
                    feature_names = enc.get_feature_names_out([col])
                    df_encoded = pd.DataFrame(matrix, columns=feature_names, index=df_out.index)
                    df_out = pd.concat([df_out, df_encoded], axis=1)
                    new_transformers[trans_key] = enc
                else:
                    # Inference but missing transformer? potentially error or skip
                    print(f"Warning: Missing transformer for {trans_key}, skipping.")

        # --- Scaling ---
        elif op == "scale_standard":
            if col in df_out.columns:
                if trans_key in transformers_to_use:
                    scaler = transformers_to_use[trans_key]
                    df_out[new_col] = scaler.transform(df_out[[col]])
                elif is_training:
                    scaler = StandardScaler()
                    df_out[new_col] = scaler.fit_transform(df_out[[col]])
                    new_transformers[trans_key] = scaler

        elif op == "scale_minmax":
            if col in df_out.columns:
                if trans_key in transformers_to_use:
                    scaler = transformers_to_use[trans_key]
                    df_out[new_col] = scaler.transform(df_out[[col]])
                elif is_training:
                    scaler = MinMaxScaler()
                    df_out[new_col] = scaler.fit_transform(df_out[[col]])
                    new_transformers[trans_key] = scaler

        # --- Outliers ---
        elif op == "clip":
            try:
                lower = float(t.get("lower")) if t.get("lower") is not None else None
                upper = float(t.get("upper")) if t.get("upper") is not None else None
            except (ValueError, TypeError):
                lower, upper = None, None
            if col in df_out.columns:
                df_out[new_col] = df_out[col].clip(lower=lower, upper=upper)

        # --- Encoding ---
        elif op == "target_encode":
            target_col = t.get("target_col")
            if col in df_out.columns:
                if trans_key in transformers_to_use:
                     enc = transformers_to_use[trans_key]
                     df_out[new_col] = enc.transform(df_out[col])
                elif is_training and target_col in df_out.columns:
                    enc = ce.TargetEncoder(cols=[col])
                    df_out[new_col] = enc.fit_transform(df_out[col], df_out[target_col])
                    new_transformers[trans_key] = enc

        # --- Time Series (Stateless by definition usually) ---
        elif op == "lag":
            try:
                periods = int(t.get("periods", 1))
            except (ValueError, TypeError):
                periods = 1
            sort_col = t.get("sort_col") 
            grp_col = t.get("group_col") 
            
            temp_df = df_out
            if sort_col:
                temp_df = _ensure_sortable(temp_df, sort_col)
                temp_df = temp_df.sort_values(sort_col)
            
            if grp_col:
                df_out[new_col] = temp_df.groupby(grp_col)[col].shift(periods)
            else:
                df_out[new_col] = temp_df[col].shift(periods)
                
        elif op == "diff":
            try:
                periods = int(t.get("periods", 1))
            except (ValueError, TypeError):
                periods = 1
            sort_col = t.get("sort_col")
            grp_col = t.get("group_col")
            
            temp_df = df_out
            if sort_col:
                temp_df = _ensure_sortable(temp_df, sort_col)
                temp_df = temp_df.sort_values(sort_col)
            
            if grp_col:
                df_out[new_col] = temp_df.groupby(grp_col)[col].diff(periods)
            else:
                df_out[new_col] = temp_df[col].diff(periods)

        elif op == "rolling":
            try:
                window = int(t.get("window", 3))
            except (ValueError, TypeError):
                window = 3
            func = t.get("func", "mean") 
            sort_col = t.get("sort_col")
            grp_col = t.get("group_col")
            
            temp_df = df_out
            if sort_col:
                temp_df = _ensure_sortable(temp_df, sort_col)
                temp_df = temp_df.sort_values(sort_col)
            
            def apply_roll(x):
                r = x.rolling(window=window)
                if func == "mean": return r.mean()
                if func == "max": return r.max()
                if func == "min": return r.min()
                if func == "std": return r.std()
                return r.mean()

            if grp_col:
                df_out[new_col] = temp_df.groupby(grp_col)[col].transform(apply_roll)
            else:
                df_out[new_col] = apply_roll(temp_df[col])

        # --- Groupby Aggr (Stateless - relies on current data) ---
        elif op == "groupby_agg":
            grp_col = t.get("group_col")
            # Support multi-column grouping (ID + filters)
            # If grp_col is list, use it. If string, wrap in list for consistency in logic, 
            # but keep it as is if pandas requires specific format? No, groupby accepts list.
            if isinstance(grp_col, str):
                grp_keys = [grp_col]
            elif isinstance(grp_col, list):
                grp_keys = grp_col
            else:
                grp_keys = []
            
            print(f"DEBUG: groupby_agg grp_col={grp_col} keys={grp_keys}")

            
            func = t.get("func", "mean")
            date_col = t.get("date_col")
            
            # Thresholds
            thresh_min = t.get("threshold_min")
            thresh_max = t.get("threshold_max")
            
            if grp_keys and col in df_out.columns:
                # Force numeric coercion to handle 'None' strings or mixed types
                target_series = pd.to_numeric(df_out[col], errors='coerce')
                
                # Apply Thresholds (Filter outliers to NaN)
                if thresh_min is not None:
                     try: target_series[target_series < float(thresh_min)] = np.nan
                     except: pass
                if thresh_max is not None:
                     try: target_series[target_series > float(thresh_max)] = np.nan
                     except: pass
                
                if date_col and date_col in df_out.columns:
                    # Leak Prevention: Expanding Window sorted by Date
                    # We need to sort by date first to use expanding correctly
                    # Since we return a column that must align with original index, we must handle sort/reindex carefully
                    
                    # 1. Create temp df with needed cols + index
                    # Ensure all group keys are in df
                    valid_keys = [k for k in grp_keys if k in df_out.columns]
                    if not valid_keys:
                        # Fallback or error?
                        return 

                    temp = df_out[valid_keys + [date_col]].copy()
                    temp['__target__'] = target_series
                    temp['__orig_idx__'] = temp.index
                    
                    # 2. Sort
                    temp = _ensure_sortable(temp, date_col)
                    # Sort by ALL group keys + date
                    temp = temp.sort_values(valid_keys + [date_col])
                    
                    # 3. Apply Expanding
                    # shift(1) is critical so we don't include CURRENT row's value in the aggregation (strict past)
                    # If we want "up to current", we remove shift. 
                    # Use case "Leak Prevention" strongly implies strict past.
                    # But expanding().mean() includes current. So we assume we want strict past.
                    # shift() applied on the group.
                    
                    # shift() applied on the group.
                    
                    
                    
                    
                    grouped = temp.groupby(valid_keys)['__target__']
                    
                    if func == "mean":
                        res = grouped.transform(lambda x: x.shift(1).expanding().mean())
                    elif func == "max":
                        res = grouped.transform(lambda x: x.shift(1).expanding().max())
                    elif func == "min":
                        res = grouped.transform(lambda x: x.shift(1).expanding().min())
                    elif func == "std":
                        res = grouped.transform(lambda x: x.shift(1).expanding().std())
                    elif func == "count":
                        res = grouped.transform(lambda x: x.shift(1).expanding().count())
                    
                    # 4. Realign to original index
                    # res has same index as temp (which is sorted)
                    # We need to map back to df_out.index
                    # Actually valid: res index IS temp index (just sorted). 
                    # So assignment via index matching works in pandas.
                    df_out[new_col] = res


                else:
                    # Standard Group Transform (Use all data in group)
                    # Use valid keys logic here too just in case
                    valid_keys = [k for k in grp_keys if k in df_out.columns]
                    if not valid_keys: return

                    if func == "mean":
                        df_out[new_col] = df_out.groupby(valid_keys)[col].transform(lambda x: target_series[x.index].mean())
                    elif func == "max":
                        df_out[new_col] = df_out.groupby(valid_keys)[col].transform(lambda x: target_series[x.index].max())
                    elif func == "min":
                        df_out[new_col] = df_out.groupby(valid_keys)[col].transform(lambda x: target_series[x.index].min())
                    elif func == "std":
                        df_out[new_col] = df_out.groupby(valid_keys)[col].transform(lambda x: target_series[x.index].std())
                    elif func == "count":
                        df_out[new_col] = df_out.groupby(valid_keys)[col].transform(lambda x: target_series[x.index].count())
                    
                    # Note: transform(func_str) is faster but lambda allows using our pre-filtered target_series easily
                    # Optimization:
                    # df_out['__temp_target__'] = target_series
                    # df_out[new_col] = df_out.groupby(grp_col)['__temp_target__'].transform(func)
                    # del df_out['__temp_target__']
                    # This is cleaner.


        # --- Arithmetic ---
        elif op == "arithmetic":
            operator = t.get("operator", "add")
            operand_type = t.get("operand_type", "scalar")
            
            right_val = None
            if operand_type == "column":
                r_col = t.get("right_col")
                if r_col and r_col in df_out.columns:
                    right_val = df_out[r_col]
            else:
                try:
                    right_val = float(t.get("value", 0))
                except (ValueError, TypeError):
                    right_val = 0

            if operator == "add":
                df_out[new_col] = df_out[col] + right_val
            elif operator == "sub":
                df_out[new_col] = df_out[col] - right_val
            elif operator == "mul":
                df_out[new_col] = df_out[col] * right_val
            elif operator == "div":
                df_out[new_col] = df_out[col] / right_val

        # --- Custom Formula ---
        elif op == "custom_formula":
            expression = t.get("expression")
            if expression and new_col:
                try:
                    # df.eval allows "col_a + col_b" syntax
                    # We might need to handle spaces in column names using backticks in the frontend or here.
                    # pandas eval supports backticks `My Col`.
                    df_out[new_col] = df_out.eval(expression)
                except Exception as e:
                    print(f"Error evaluating formula '{expression}': {e}")
                    # Optionally raise or skip. For now, we skip to avoid crashing entire pipeline, but user needs feedback.
                    # Given this is a creation flow, raising might be better in the API, but here we perform safe fail?
                    # Let's assign NaN or raise. Raising ensures the user knows their formula is bad during preview.
                    raise ValueError(f"Formula evaluation failed: {e}")

        # --- Filtering ---
        elif op == "filter":
            conditions = t.get("conditions", [])
            if not isinstance(conditions, list):
                # Legacy or single condition format if needed, but let's stick to list
                conditions = []
            
            for cond in conditions:
                f_col = cond.get("col")
                f_op = cond.get("op", "eq")
                f_val = cond.get("val")
                
                if f_col in df_out.columns:
                    col_dtype = df_out[f_col].dtype
                    
                    # Helper to coerce value to match column type
                    def _coerce_val(val, dtype):
                        if pd.api.types.is_numeric_dtype(dtype):
                            try:
                                f = float(val)
                                if f.is_integer(): return int(f)
                                return f
                            except: return val
                        elif pd.api.types.is_datetime64_any_dtype(dtype):
                            try: return pd.to_datetime(val)
                            except: return val
                        return val

                    # Coerce f_val for scalar ops
                    if f_op not in ["in", "not_in"]:
                        f_val = _coerce_val(f_val, col_dtype)

                    if f_op == "eq":
                        df_out = df_out[df_out[f_col] == f_val]
                    elif f_op == "neq":
                        df_out = df_out[df_out[f_col] != f_val]
                    elif f_op == "gt":
                        df_out = df_out[df_out[f_col] > f_val]
                    elif f_op == "lt":
                        df_out = df_out[df_out[f_col] < f_val]
                    elif f_op == "gte":
                        df_out = df_out[df_out[f_col] >= f_val]
                    elif f_op == "lte":
                        df_out = df_out[df_out[f_col] <= f_val]
                    elif f_op == "in":
                        if isinstance(f_val, list):
                            vals = [_coerce_val(v, col_dtype) for v in f_val]
                            df_out = df_out[df_out[f_col].isin(vals)]
                        else:
                            # Split string by comma if provided as string
                            raw_vals = [v.strip() for v in str(f_val).split(',') if v.strip()]
                            vals = [_coerce_val(v, col_dtype) for v in raw_vals]
                            df_out = df_out[df_out[f_col].isin(vals)]
                    elif f_op == "not_in":
                        if isinstance(f_val, list):
                            vals = [_coerce_val(v, col_dtype) for v in f_val]
                            df_out = df_out[~df_out[f_col].isin(vals)]
                        else:
                             raw_vals = [v.strip() for v in str(f_val).split(',') if v.strip()]
                             vals = [_coerce_val(v, col_dtype) for v in raw_vals]
                             df_out = df_out[~df_out[f_col].isin(vals)]
            
            # Reset index after filtering? Usually good practice if not time-series dependent on index
            df_out = df_out.reset_index(drop=True)

    return df_out, new_transformers

def create_feature_set(db: Session, config: schemas.FeatureSetCreate):
    print("DEBUG: create_feature_set called")
    
    # 0. Handle Container Creation (No Dataset yet)
    if config.dataset_version_id is None:
        print("DEBUG: Creating Feature Set Container (No Dataset)")
        db_fs = models.FeatureSet(
            name=config.name,
            description=config.description
        )
        db.add(db_fs)
        db.commit()
        db.refresh(db_fs)
        return db_fs, []

    try:
        # 1. Load Dataset Version
        ds_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == config.dataset_version_id).first()
        if not ds_version:
            raise ValueError("Dataset version not found")
            
        print(f"DEBUG: Loading dataset parquet from {ds_version.path}")
        df = storage.load_parquet_to_dataframe(ds_version.path)
        
        # 2. Apply Transformations
        print(f"DEBUG: Applying transformations: {config.transformations}")
        df_features, fitted_transformers = apply_transformations(df, config.transformations or [])
        print("DEBUG: Transformations applied successfully")
        
        # 3. Save Feature Set
        version_tag = config.version or f"fv_{uuid.uuid4().hex[:8]}"
        if not version_tag.endswith(".parquet"):
            filename = f"{version_tag}.parquet"
        else:
            filename = version_tag
            version_tag = filename.replace(".parquet", "")

        save_path = f"{FEATURE_ROOT}/{ds_version.dataset.name}/{filename}"
        full_path = os.path.abspath(save_path)
        
        print(f"DEBUG: Saving feature set to {full_path}")
        storage.save_dataframe_to_parquet(df_features, full_path)

        # Save Transformers
        transformers_path = full_path.replace(".parquet", ".pkl")
        try:
             joblib.dump(fitted_transformers, transformers_path)
             print(f"DEBUG: Transformers saved to {transformers_path}")
        except Exception as e:
             print(f"ERROR: Failed to save transformers: {e}")
        
        if os.path.exists(full_path):
            print(f"DEBUG: File created at {full_path}")
        else:
            print(f"DEBUG: ERROR - File creation check failed at {full_path}")
        
        # 4. Save Metadata
        db_fs = models.FeatureSet(
            dataset_version_id=config.dataset_version_id,
            version=version_tag,
            path=full_path,
            transformations=config.transformations or [],
            active_features=config.active_features,
            target_column=config.target_column
        )
        db.add(db_fs)
        db.commit()
        db.refresh(db_fs)
        print(f"DEBUG: Feature Set ID {db_fs.id} created successfully")
        return db_fs, df_features.columns.tolist()
    except Exception as e:
        print(f"ERROR in create_feature_set: {e}")
        import traceback
        traceback.print_exc()
        raise e

def get_feature_set(db: Session, feature_set_id: int):
    return db.query(models.FeatureSet).filter(models.FeatureSet.id == feature_set_id).first()

def get_feature_sets(db: Session):
    return db.query(models.FeatureSet).all()

def save_feature_set_from_df(db: Session, dataset_version_id: int, df: pd.DataFrame, version_tag: str = None):
    # 1. Load Dataset Version (for naming)
    ds_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == dataset_version_id).first()
    if not ds_version:
        raise ValueError("Dataset version not found")
        
    # 2. Determine Version
    version_tag = version_tag or f"fv_{uuid.uuid4().hex[:8]}"
    save_path = f"{FEATURE_ROOT}/{ds_version.dataset.name}/{version_tag}.parquet"
    full_path = os.path.abspath(save_path)
    
    # 3. Save Parquet
    storage.save_dataframe_to_parquet(df, full_path)
    
    # 4. Save Metadata
    db_fs = models.FeatureSet(
        dataset_version_id=dataset_version_id,
        version=version_tag,
        path=full_path
    )
    db.add(db_fs)
    db.commit()
    db.refresh(db_fs)
    return db_fs

def update_feature_set(db: Session, feature_set_id: int, config: schemas.FeatureSetCreate):
    print(f"DEBUG: update_feature_set called for ID={feature_set_id}")
    # 1. Check existence
    db_fs = db.query(models.FeatureSet).filter(models.FeatureSet.id == feature_set_id).first()
    if not db_fs:
        print("DEBUG: Feature set not found")
        raise ValueError("Feature set not found")

    # 2. Load Dataset Version (New or Existing)
    ds_version_id = config.dataset_version_id
    print(f"DEBUG: Loading dataset version {ds_version_id}")
    ds_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == ds_version_id).first()
    if not ds_version:
        print("DEBUG: Dataset version not found")
        raise ValueError("Dataset version not found")

    print(f"DEBUG: Loading parquet from {ds_version.path}")
    try:
        df = storage.load_parquet_to_dataframe(ds_version.path)
        print(f"DEBUG: Loaded dataframe with shape {df.shape}")
    except Exception as e:
        print(f"DEBUG: Failed to load dataset parquet: {e}")
        raise e

    # 3. Apply New Transformations
    print(f"DEBUG: Applying transformations: {config.transformations}")
    try:
        df_features, fitted_transformers = apply_transformations(df, config.transformations)
        print(f"DEBUG: Transformations applied. Result shape: {df_features.shape}")
    except Exception as e:
        print(f"DEBUG: Transformation failed: {e}")
        import traceback
        traceback.print_exc()
        raise e

    # 4. Save to Parquet (Overwrite or New Path)
    # If version changed, path updates. If same, overwrite.
    version_tag = config.version or db_fs.version or f"fv_{uuid.uuid4().hex[:8]}" 
    # Ensure it ends with parquet
    if not version_tag.endswith(".parquet"):
        filename = f"{version_tag}.parquet"
    else:
        filename = version_tag
        version_tag = filename.replace(".parquet", "")

    # Construct path
    # We use the dataset name folder
    save_dir = f"{FEATURE_ROOT}/{ds_version.dataset.name}"
    if not os.path.exists(save_dir):
        os.makedirs(save_dir, exist_ok=True)
        
    save_path = f"{save_dir}/{filename}"
    full_path = os.path.abspath(save_path)

    print(f"DEBUG: Saving updated feature set to {full_path}")
    try:
        storage.save_dataframe_to_parquet(df_features, full_path)
        
        # Save Transformers
        transformers_path = full_path.replace(".parquet", ".pkl")
        joblib.dump(fitted_transformers, transformers_path)
        
        print("DEBUG: Save successful")
    except Exception as e:
        print(f"DEBUG: Save failed: {e}")
        raise e

    # 5. Update DB Record
    db_fs.dataset_version_id = ds_version_id
    db_fs.version = version_tag
    db_fs.transformations = config.transformations
    db_fs.path = full_path
    if config.active_features is not None:
        db_fs.active_features = config.active_features
    if config.target_column is not None:
        db_fs.target_column = config.target_column

    db.commit()
    db.refresh(db_fs)
    print("DEBUG: DB updated successfully")
    return db_fs, df_features.columns.tolist()

def delete_feature_set(db: Session, feature_set_id: int):
    # 1. Fetch
    db_fs = db.query(models.FeatureSet).filter(models.FeatureSet.id == feature_set_id).first()
    if not db_fs:
        raise ValueError("Feature set not found")
        
    # 2. Delete File
    if db_fs.path and os.path.exists(db_fs.path):
        try:
            os.remove(db_fs.path)
            # Delete transformers file if exists
            transformers_path = db_fs.path.replace(".parquet", ".pkl")
            if os.path.exists(transformers_path):
                os.remove(transformers_path)
        except Exception as e:
            print(f"Warning: Failed to delete file at {db_fs.path}. {e}")
            
    # 3. Delete Record
    db.delete(db_fs)
    db.commit()
    return True


