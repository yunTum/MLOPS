import streamlit as st
from app.ui import utils
import json

st.title("Model Experiments")

# Train
st.header("Train New Model")

feature_set_id = st.number_input("Feature Set ID", min_value=1, step=1)
target_col = st.text_input("Target Column Name")
experiment_name = st.text_input("Experiment Name", "Default")

default_params = {"objective": "regression", "metric": "rmse", "learning_rate": 0.05, "n_estimators": 100}
params_str = st.text_area("LightGBM Parameters (JSON)", value=json.dumps(default_params, indent=2))

if st.button("Start Training"):
    try:
        params = json.loads(params_str)
        payload = {
            "feature_set_id": feature_set_id,
            "target_col": target_col,
            "params": params,
            "experiment_name": experiment_name
        }
        res = utils.post("models/train", json=payload)
        st.success(f"Training Complete! Model ID: {res['id']}, Run ID: {res['mlflow_run_id']}")
        st.json(res['metrics'])
    except Exception as e:
        st.error(f"Training Failed: {e}")

st.divider()
st.header("Model Registry")
models = utils.get("models/")
if models:
    st.dataframe(models)
else:
    st.info("No models found.")
