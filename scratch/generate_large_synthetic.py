import csv
import random

departments = ["CE", "EC", "IT"]
classes = {"CE": ["CE-1", "CE-2"], "EC": ["EC-1", "EC-2"], "IT": ["IT-1"]}
semesters = [1, 2, 3, 4]

# 1. Generate Faculty
faculty = []
fac_count = 1
for dept in departments:
    for i in range(2):
        emp_id = f"EMP{dept}{i+1}"
        name = f"Faculty {dept} {i+1}"
        email = f"pujarayash3122+fac{fac_count}@gmail.com"
        subject = f"{dept} Subject {i+1}"
        faculty.append([fac_count, emp_id, dept, name, email, subject])
        fac_count += 1

with open("SYNTHETIC_faculty_data.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Sr.No", "empID", "Department", "Faculty-Name", "Email", "Subject Teaching"])
    writer.writerows(faculty)

# 2. Generate Classes
cls_data = []
for dept in departments:
    for c in classes[dept]:
        for sem in semesters:
            cls_data.append([dept, sem, c])

with open("SYNTHETIC_classes_data.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Department", "Semester", "Class"])
    writer.writerows(cls_data)

# 3. Generate Students & Academic Data
students = []
academic = []

# We need at least 60 total, let's do 75
# Ensure at least 15 outcome_flag=1 and 15 outcome_flag=0
# Let's assign an outcome based on attendance & marks to make the model happy.

for i in range(1, 76):
    dept = random.choice(departments)
    c = random.choice(classes[dept])
    sem = random.choice(semesters)
    
    enr = f"2026{dept}{sem}{i:03d}"
    gr = f"GR{dept}{sem}{i:03d}"
    name = f"Student {i} {dept}"
    email = f"pujarayash3122+stu{i}@gmail.com"
    subj1 = f"{dept} Subject 1"
    subj2 = f"{dept} Subject 2"
    
    students.append([i, enr, gr, name, c, dept, email, subj1, subj2])
    
    # 30% chance of being "at risk" (outcome=1)
    # If at risk, low attendance, low marks
    # If safe, high attendance, high marks
    
    is_at_risk = (i % 3 == 0) # exactly 25 at-risk, 50 safe
    
    if is_at_risk:
        att = round(random.uniform(40.0, 65.0), 1)
        internal = round(random.uniform(10.0, 18.0), 1)
        quiz = round(random.uniform(3.0, 6.0), 1)
        assignment = round(random.uniform(30.0, 60.0), 1)
        logins = random.randint(0, 2)
        cgpa = round(random.uniform(4.0, 6.5), 1)
        intervention = 1 if random.random() > 0.5 else 0
        outcome = 1
    else:
        att = round(random.uniform(75.0, 98.0), 1)
        internal = round(random.uniform(22.0, 30.0), 1)
        quiz = round(random.uniform(7.0, 10.0), 1)
        assignment = round(random.uniform(80.0, 100.0), 1)
        logins = random.randint(3, 7)
        cgpa = round(random.uniform(7.5, 9.8), 1)
        intervention = 0
        outcome = 0
        
    mentor_email = "yash.pujara131786@marwadiuniversity.ac.in"
    
    academic.append([
        enr, name, dept, sem, c, mentor_email, 
        att, internal, quiz, assignment, logins, cgpa, intervention, outcome
    ])

with open("SYNTHETIC_sample_students.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Sr.No", "Enrollment Number", "GR Number", "Name", "Class", "Department", "Email", "Subject1", "Subject2"])
    writer.writerows(students)
    
with open("SYNTHETIC_academic_data.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([
        "student_id", "name", "branch", "semester", "class_code", "mentor_email", 
        "attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct", 
        "lms_logins_per_week", "prior_cgpa", "intervention_flag", "outcome_flag"
    ])
    writer.writerows(academic)

print("Generated 4 CSV files successfully!")
