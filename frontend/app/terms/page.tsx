import Link from "next/link";
export const metadata = { title: "Terms and conditions | Student Success Platform" };
const ORG = process.env.NEXT_PUBLIC_ORG_NAME || "the institution that runs this service";
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Terms() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 prose-doc">
      <Link href="/" className="text-sm underline">Back to sign in</Link>
      <h1 className="text-2xl font-bold mt-3">Terms and conditions</h1>
      <p className="muted">Last updated: 10 October 2026</p>

      <h2>1. Acceptance</h2>
      <p>By signing in you agree to these terms. The service is provided by {ORG} for its students, faculty, mentors and administrators.</p>

      <h2>2. Accounts</h2>
      <ul>
        <li>Accounts are created by an administrator. Your login ID is your employee ID or enrollment number.</li>
        <li>You must change your temporary password at first sign-in and keep it private.</li>
        <li>Do not use another person's account or share yours. You are responsible for activity under your account.</li>
        <li>After five failed sign-in attempts an ID is locked for 15 minutes.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Use the service only for teaching, learning and student support at the institution.</li>
        <li>Do not try to open records you are not assigned to, bypass access controls, or disrupt the service.</li>
        <li>Do not copy or share student information outside the institution's policies.</li>
      </ul>

      <h2>4. Estimates, not decisions</h2>
      <p>Risk scores, reasons and what-if results are estimates learned from past data. They show association, not proof of cause, and can be wrong. They must not be the only basis for any decision about a student. Intervention plans take effect only after a mentor approves them.</p>

      <h2>5. Accuracy of data</h2>
      <p>Results depend on the data uploaded by the institution. Administrators are responsible for uploading accurate and current data. If you see an error in your own record, tell your administrator.</p>

      <h2>6. Availability</h2>
      <p>The service may be unavailable for maintenance or for reasons outside our control. Features may change over time.</p>

      <h2>7. Suspension</h2>
      <p>The institution may suspend or delete an account that breaks these terms or when a person leaves the institution.</p>

      <h2>8. Liability</h2>
      <p>To the extent the law allows, the institution is not liable for losses that arise from relying on estimates shown in the service or from the service being unavailable.</p>

      <h2>9. Governing law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>10. Contact</h2>
      <p>{CONTACT ? <>Questions about these terms: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <>Questions about these terms: contact your institution's administrator.</>} See also the <Link className="underline" href="/privacy">privacy policy</Link>.</p>
    </main>
  );
}
