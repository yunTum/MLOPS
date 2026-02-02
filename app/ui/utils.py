import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_HOST = os.getenv('API_HOST', 'localhost')
API_PORT = os.getenv('API_PORT', 8000)
API_URL = f"http://{API_HOST}:{API_PORT}/api/v1"

def get(endpoint):
    try:
        response = requests.get(f"{API_URL}/{endpoint}")
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return None

def post(endpoint, json=None, files=None):
    try:
        response = requests.post(f"{API_URL}/{endpoint}", json=json, files=files)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        raise e
