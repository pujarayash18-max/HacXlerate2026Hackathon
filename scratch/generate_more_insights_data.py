import csv
import random

departments = ["CE", "EC", "IT"]
classes = {"CE": ["CE-1", "CE-2"], "EC": ["EC-1", "EC-2"], "IT": ["IT-1"]}
semesters = [1, 2]

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

with open("SYNTHETIC_faculty_data_V2.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Sr.No", "empID", "Department", "Faculty-Name", "Email", "Subject Teaching"])
    writer.writerows(faculty)

# 2. Generate Classes
cls_data = []
for dept in departments:
    for c in classes[dept]:
        for sem in semesters:
            cls_data.append([dept, sem, c])

with open("SYNTHETIC_classes_data_V2.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Department", "Semester", "Class"])
    writer.writerows(cls_data)

# 3. Generate Students & Academic Data
students = []
academic = []

# 150 students. 50 at risk (outcome=1), 100 safe (outcome=0).
for i in range(1, 151):
    dept = random.choice(departments)
    c = random.choice(classes[dept])
    
    enr = f"2026{dept}{i:04d}"
    gr = f"GR{dept}{i:04d}"
    name = f"Student {i} {dept}"
    email = f"pujarayash3122+stu{i}@gmail.com"
    subj1 = f"{dept} Subject 1"
    subj2 = f"{dept} Subject 2"
    
    students.append([i, enr, gr, name, c, dept, email, subj1, subj2])
    
    is_at_risk = (i % 3 == 0) # 50 at-risk, 100 safe
    
    mentor_email = "yash.pujara131786@marwadiuniversity.ac.in"
    
    # Semester 1
    att1 = round(random.uniform(80.0, 95.0), 1)
    internal1 = round(random.uniform(20.0, 28.0), 1)
    quiz1 = round(random.uniform(6.0, 9.0), 1)
    assign1 = round(random.uniform(70.0, 90.0), 1)
    logins1 = random.randint(4, 8)
    cgpa1 = round(random.uniform(6.5, 9.0), 1)
    
    academic.append([
        enr, name, dept, 1, c, mentor_email, 
        att1, internal1, quiz1, assign1, logins1, cgpa1, 0, None
    ])
    
    # Semester 2
    if is_at_risk:
        # Marks drop, attendance < 75, assignments < 60, logins < median
        att2 = round(random.uniform(40.0, 65.0), 1)
        internal2 = round(random.uniform(10.0, internal1 - 2.0), 1) # Force drop
        quiz2 = round(random.uniform(3.0, 6.0), 1)
        assign2 = round(random.uniform(30.0, 55.0), 1)
        logins2 = random.randint(0, 2)
        cgpa2 = round(random.uniform(4.0, cgpa1 - 1.0), 1)
        intervention2 = 1 if random.random() > 0.5 else 0
        outcome2 = 1
    else:
        # Marks stay same or increase
        att2 = round(random.uniform(75.0, 98.0), 1)
        internal2 = round(random.uniform(internal1, 30.0), 1)
        quiz2 = round(random.uniform(7.0, 10.0), 1)
        assign2 = round(random.uniform(80.0, 100.0), 1)
        logins2 = random.randint(3, 7)
        cgpa2 = round(random.uniform(cgpa1, 9.8), 1)
        intervention2 = 0
        outcome2 = 0
        
    academic.append([
        enr, name, dept, 2, c, mentor_email, 
        att2, internal2, quiz2, assign2, logins2, cgpa2, intervention2, outcome2
    ])

with open("SYNTHETIC_sample_students_V2.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Sr.No", "Enrollment Number", "GR Number", "Name", "Class", "Department", "Email", "Subject1", "Subject2"])
    writer.writerows(students)
    
with open("SYNTHETIC_academic_data_V2.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([
        "student_id", "name", "branch", "semester", "class_code", "mentor_email", 
        "attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct", 
        "lms_logins_per_week", "prior_cgpa", "intervention_flag", "outcome_flag"
    ])
    writer.writerows(academic)

print("Generated 4 CSV files successfully!")
