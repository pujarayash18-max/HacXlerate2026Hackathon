import requests

def run():
    print("Logging in...")
    r = requests.post("http://localhost:8000/auth/login", data={"username": "admin@yourcollege.edu", "password": "change-this-now"})
    if r.status_code != 200:
        print("Failed to login:", r.text)
        return
    tok = r.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {tok}"}
    
    print("Uploading academic data...")
    with open("SYNTHETIC_academic_data_V2.csv", "rb") as f:
        r = requests.post("http://localhost:8000/ingest/upload?mode=add", headers=hdrs, files={"file": f})
        print(r.status_code, r.text)

    print("Training model...")
    r = requests.post("http://localhost:8000/admin/train", headers=hdrs)
    print(r.status_code, r.text)
    
    print("Generating insights...")
    r = requests.post("http://localhost:8000/insights/generate", headers=hdrs)
    print(r.status_code, r.text)
    
if __name__ == "__main__":
    run()
