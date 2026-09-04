from fastapi import FastAPI
from supabase import create_client
import os
import time
import requests
import threading   # ← this was missing

app = FastAPI()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def keep_awake():
    while True:
        try:
            requests.get("https://ranikuthi.onrender.com//")
        except Exception as e:
            print("Keep-alive failed:", e)
        time.sleep(300)  # every 5 minutes

# Start background thread
threading.Thread(target=keep_awake, daemon=True).start()

@app.get("/")
def root():
    return {"message": "Hello from Render + Supabase!"}

@app.get("/users")
def get_users():
    try:
        response = supabase.table("users").select("*").execute()
        return response.data  # returns [] if table is empty
    except Exception as e:
        return {"error": str(e)}

@app.get("/flats")
def get_flats():
    try:
        response = supabase.table("flats").select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}
