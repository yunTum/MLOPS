import streamlit as st

st.set_page_config(page_title="MLOps App", layout="wide")

st.title("Python x LightGBM MLOps Application")
st.markdown("""
### Welcome
This application manages the end-to-end Machine Learning lifecycle.

**Modules:**
- **Data Management**: Upload and version datasets.
- **Feature Builder**: Design and generate features.
- **Model Experiments**: Train and compare models.
- **Inference**: Run predictions.
""")
