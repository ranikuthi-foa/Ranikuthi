
from fastapi import FastAPI
from supabase import create_client, Client
import os

app = FastAPI()

# Environment variables (set in Render later)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/users")
def get_users():
    response = supabase.table("users").select("*").execute()
    return response.data

@app.get("/flats")
def get_flats():
    response = supabase.table("flats").select("*").execute()
    return response.data

@app.post("/payments")
def add_payment(payment: dict):
    response = supabase.table("payments").insert(payment).execute()
    return response.data
