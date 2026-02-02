import streamlit as st
from app.ui import utils
import pandas as pd

st.title("Data Management")

tab1, tab2, tab3 = st.tabs(["Datasets List", "Create Dataset", "Upload Version"])

with tab1:
    datasets = utils.get("datasets/")
    if datasets:
        df = pd.DataFrame(datasets)
        st.dataframe(df)
    else:
        st.info("No datasets found or API offline.")

with tab2:
    with st.form("create_dataset"):
        name = st.text_input("Dataset Name")
        desc = st.text_area("Description")
        submitted = st.form_submit_button("Create")
        if submitted:
            try:
                res = utils.post("datasets/", json={"name": name, "description": desc})
                st.success(f"Created dataset: {res['name']}")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

with tab3:
    dataset_list = utils.get("datasets/")
    if dataset_list:
        options = {d['name']: d['id'] for d in dataset_list}
        selected_name = st.selectbox("Select Dataset", list(options.keys()))
        selected_id = options[selected_name]
        
        uploaded_file = st.file_uploader("Upload CSV/Parquet", type=["csv", "parquet"])
        if uploaded_file and st.button("Upload"):
            try:
                files = {"file": (uploaded_file.name, uploaded_file, "application/octet-stream")}
                res = utils.post(f"datasets/{selected_id}/upload", files=files)
                st.success(f"Uploaded version: {res['version']}")
            except Exception as e:
                st.error(f"Upload failed: {e}")
    else:
        st.warning("Create a dataset first.")
