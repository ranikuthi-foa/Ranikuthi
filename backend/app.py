from fastapi import FastAPI
from supabase import create_client
import os

app = FastAPI()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/")
def root():
    return {"message": "Hello from Render + Supabase!"}

@app.get("/users")
def get_users():
    try:
        response = supabase.table("users").select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}

@app.get("/flats")
def get_flats():
    try:
        response = supabase.table("flats").select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}
