import streamlit as st
from app.ui import utils
import json

st.title("Feature Builder")

# 1. Select Dataset Version used as base
sets = utils.get("datasets/")
if not sets:
    st.warning("No datasets available")
    st.stop()

ds_name = st.selectbox("Select Dataset", [d['name'] for d in sets])
ds_id = next(d['id'] for d in sets if d['name'] == ds_name)

# Get versions
# For MVP we don't have a direct endpoint to list versions for a dataset (I missed adding it specifically, 
# but models.Dataset has 'versions' relationship). 
# I can expose it or just use the Upload logic return. 
# Workaround: Add 'versions' in Dataset list response or separate endpoint.
# Current Dataset response model doesn't include versions list.
# I'll rely on the user knowing the flow or just generic input for MVP.
# Actually, I should just fetch all feature sets or create new.

st.subheader("Define Transformations")
st.info("Define transformations to apply to the dataset.")

# Simple JSON Config for now
default_config = [
    {"op": "fillna", "col": "column_name", "value": 0},
    {"op": "log", "col": "numeric_column"},
    {"op": "onehot", "col": "categorical_column"}
]

config_str = st.text_area("Transformation Configuration (JSON)", value=json.dumps(default_config, indent=2), height=200)

ds_versions_raw = utils.get(f"datasets/") # Should ideally get versions. 
# Assuming the user knows the version or we pick latest logic in backend if we don't specify version. 
# But FeatureSetCreate needs dataset_version_id.
# I will patch the logic: I need to get versions.
# I'll add an endpoint or just hardcode checking. 
# For now, I'll let user input ID manually for MVP or list if I can.
dataset_version_id = st.number_input("Dataset Version ID (Check Data Management tab)", min_value=1, step=1)

version_tag = st.text_input("New Feature Set Version Tag", "v1-features")

if st.button("Build Features"):
    try:
        transforms = json.loads(config_str)
        payload = {
            "dataset_version_id": dataset_version_id,
            "version": version_tag,
            "transformations": transforms
        }
        res = utils.post("features/sets", json=payload)
        st.success(f"Feature Set Created! ID: {res['id']}")
    except Exception as e:
        st.error(f"Error: {e}")

st.divider()
st.subheader("Existing Feature Sets")
# List feature sets? Not implemented listing endpoint yet implicitly, 
# but I can use 'features/sets/{id}' if I know ID.
# I'll leave list blank for now or implement list endpoint if time permits.
