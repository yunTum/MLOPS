import duckdb
import pandas as pd
from pathlib import Path

def get_duckdb_con():
    return duckdb.connect(database=":memory:") # Use in-memory or persisted DuckDB

def save_dataframe_to_parquet(df: pd.DataFrame, path: str):
    """
    Saves a pandas DataFrame to Parquet.
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)

def save_chunks_to_parquet(chunks_iterator, path: str):
    """
    Saves an iterator of DataFrames to a single Parquet file using PyArrow.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq
    import gc

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    writer = None
    for i, chunk in enumerate(chunks_iterator):
        table = pa.Table.from_pandas(chunk)
        if writer is None:
            writer = pq.ParquetWriter(path, table.schema)
        writer.write_table(table)
        
        # Explicitly free memory (GC only periodically if needed, relying on ref counting)
        del chunk
        del table
    
    if writer:
        writer.close()

def load_parquet_to_dataframe(path: str) -> pd.DataFrame:
    """
    Loads Parquet file to DataFrame.
    """
    return pd.read_parquet(path)

def query_parquet_using_duckdb(query: str, parquet_path: str) -> pd.DataFrame:
    """
    Executes a SQL query on a Parquet file using DuckDB.
    Replace 'target_table' in query with the parquet file scan.
    """
    con = get_duckdb_con()
    # In real usage, might need to register parquet file as view or replace text
    # This is a simplified helper
    query = query.replace("target_table", f"'{parquet_path}'")
    return con.execute(query).df()

def peek_parquet(path: str, n: int = 5) -> pd.DataFrame:
    """
    Reads the first n rows of a Parquet file.
    """
    # Use DuckDB for efficient head limit if possible, or pyarrow
    # fallback to pandas read_parquet generic
    try:
        con = get_duckdb_con()
        query = f"SELECT * FROM '{path}' LIMIT {n}"
        return con.execute(query).df()
    except Exception as e:
        print(f"DuckDB peek failed, falling back to pandas: {e}")
        return pd.read_parquet(path).head(n)
