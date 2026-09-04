import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseSettings, BaseModel
from supabase import create_client

# Settings
class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    KEEP_ALIVE_URL: Optional[str] = "https://ranikuthi.onrender.com/"
    KEEP_ALIVE_INTERVAL: int = 300  # seconds

    class Config:
        env_file = ".env"

settings = Settings()  # will raise if required env vars are missing

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
executor = ThreadPoolExecutor(max_workers=4)

# Simple response models (adjust fields to match your DB)
class User(BaseModel):
    id: int
    email: Optional[str]

class Flat(BaseModel):
    id: int
    address: Optional[str]

# Startup/shutdown lifecycle
@app.on_event("startup")
async def startup_event():
    # create and store client
    app.state.supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    app.state.keep_alive_task = asyncio.create_task(_keep_awake_background())
    logger.info("Startup complete, supabase client initialized and keep-alive started")

@app.on_event("shutdown")
async def shutdown_event():
    task = getattr(app.state, "keep_alive_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    executor.shutdown(wait=False)
    logger.info("Shutdown complete")

# Background keep-alive using async httpx client
async def _keep_awake_background():
    url = settings.KEEP_ALIVE_URL.rstrip("/") + "/"
    interval = settings.KEEP_ALIVE_INTERVAL
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                resp = await client.get(url)
                logger.debug("Keep-alive ping status=%s", resp.status_code)
            except Exception as e:
                logger.warning("Keep-alive failed: %s", e)
            await asyncio.sleep(interval)

# Helper to run possibly-blocking supabase calls in threadpool
async def run_db(func, *args, **kwargs):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, lambda: func(*args, **kwargs))

@app.get("/", response_model=dict)
async def root():
    return {"message": "Hello from Render + Supabase!"}

@app.get("/users", response_model=List[User])
async def get_users():
    supabase = app.state.supabase
    try:
        # supabase.table(...).select(...).execute() is blocking; run in executor
        result = await run_db(supabase.table("users").select, "*")
        # execute call may be a separate method depending on client; adapt if needed:
        rows = await run_db(lambda: result.execute().data) if hasattr(result, "execute") else result.execute().data
        return rows or []
    except Exception as e:
        logger.exception("Failed to fetch users")
        raise HTTPException(status_code=502, detail="Failed to fetch users")

@app.get("/flats", response_model=List[Flat])
async def get_flats():
    supabase = app.state.supabase
    try:
        result = await run_db(supabase.table("flats").select, "*")
        rows = await run_db(lambda: result.execute().data) if hasattr(result, "execute") else result.execute().data
        return rows or []
    except Exception as e:
        logger.exception("Failed to fetch flats")
        raise HTTPException(status_code=502, detail="Failed to fetch flats")
