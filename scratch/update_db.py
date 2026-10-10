import os
import sys

# add backend path so we can import app
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy import create_engine, text

# Get URL from env or use hardcoded for local test if outside docker
url = os.getenv("DATABASE_URL", "postgresql+psycopg2://ssp:ssp@localhost:5432/ssp")
engine = create_engine(url)

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE faculty ADD COLUMN email VARCHAR;"))
        conn.execute(text("ALTER TABLE student ADD COLUMN email VARCHAR;"))
        conn.commit()
    print("Columns added successfully.")
except Exception as e:
    print(f"Error adding columns: {e}")
