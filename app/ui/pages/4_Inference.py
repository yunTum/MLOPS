import streamlit as st
from app.ui import utils
import json

st.title("Inference")

st.info("Run predictions using trained models.")

model_id = st.number_input("Model ID", min_value=1, step=1)

default_input = [{"feature1": 0.5, "feature2": 1.2}]
input_str = st.text_area("Input Data (JSON List of Dicts)", value=json.dumps(default_input, indent=2))

if st.button("Predict"):
    try:
        data = json.loads(input_str)
        payload = {
            "model_id": model_id,
            "data": data
        }
        res = utils.post("inference/predict", json=payload)
        st.success("Prediction Successful")
        st.write(res['predictions'])
    except Exception as e:
        st.error(f"Prediction Failed: {e}")
