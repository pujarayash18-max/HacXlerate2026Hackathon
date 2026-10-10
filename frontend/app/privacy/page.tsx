import Link from "next/link";
export const metadata = { title: "Privacy policy | Student Success Platform" };
const ORG = process.env.NEXT_PUBLIC_ORG_NAME || "the institution that runs this service";
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Privacy() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 prose-doc">
      <Link href="/" className="text-sm underline">Back to sign in</Link>
      <h1 className="text-2xl font-bold mt-3">Privacy policy</h1>
      <p className="muted">Last updated: 10 October 2026</p>

      <h2>1. Who runs this service</h2>
      <p>This service is operated by {ORG}. The institution decides what data is loaded and who may use it, and is responsible for that data under India's Digital Personal Data Protection Act, 2023.</p>

      <h2>2. What data is stored</h2>
      <ul>
        <li>Account data: name, login ID (employee ID or enrollment number), role, department, class, subjects, and a salted hash of your password.</li>
        <li>Academic and engagement data loaded by the institution: attendance, internal marks, quiz scores, assignment completion, learning platform activity, prior CGPA, interventions and outcomes.</li>
        <li>Work done in the service: risk estimates, mentor notes, intervention plans and follow-up status.</li>
        <li>An audit log recording which signed-in user opened which student record, and when.</li>
      </ul>

      <h2>3. Why it is used</h2>
      <p>To show each student's progress over time, estimate academic risk early, explain the main reasons behind an estimate, help mentors prepare action plans, and give administrators anonymised institution-level reports. Data is not used for advertising and is not sold.</p>

      <h2>4. Who can see what</h2>
      <ul>
        <li>Students see their own data and their own approved plans only.</li>
        <li>Faculty see students in the classes assigned to them.</li>
        <li>Mentors see the students assigned to them.</li>
        <li>Administrators manage accounts and uploads and see anonymised analytics. They do not open individual academic records.</li>
      </ul>

      <h2>5. Estimates and human review</h2>
      <p>Risk scores and what-if results are statistical estimates based on past data. They are not decisions. A mentor reviews and approves every intervention plan before a student can see it.</p>

      <h2>6. AI study assistant</h2>
      <p>If the institution has enabled the AI study assistant, the question you type and your own records are sent to Anthropic's API to produce an answer. Other students' data is never included. If it is not enabled, answers are produced by simple rules inside this service and nothing is sent to a third party.</p>

      <h2>7. Passwords</h2>
      <p>Passwords are stored as salted hashes. A temporary password generated for you is visible to the administrator until you set your own password at first sign-in. If you forget your password, you can send a request from the sign-in page. The administrator verifies your identity and issues a new temporary password.</p>

      <h2>8. Browser storage</h2>
      <p>The service uses no advertising or tracking cookies. Your sign-in session is kept in your browser's session storage and is removed when you sign out or close the tab.</p>

      <h2>9. Retention and deletion</h2>
      <p>Data is kept for as long as the institution needs it for the purposes above, or as the law requires. When an administrator deletes a student or faculty record, the linked account, plans and notes are deleted with it.</p>

      <h2>10. Your rights</h2>
      <p>You may ask to see the data held about you, to correct it, to have it erased where the law allows, and to raise a grievance about how it is handled.{CONTACT ? <> Write to <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <> Contact your institution's administrator or data protection officer.</>}</p>

      <h2>11. Security</h2>
      <p>Access is controlled by role, connections should be served over HTTPS, and access to student records is logged. No system is completely secure, so please keep your password private.</p>

      <h2>12. Changes</h2>
      <p>If this policy changes, the date at the top will change with it.</p>
    </main>
  );
}
