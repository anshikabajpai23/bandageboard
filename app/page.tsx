// Placeholder shell. Person 3 owns the real biller dashboard in /app + /components.
// Backend is live: GET /api/eligibility returns the EligibilityResult[] contract.

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720 }}>
      <h1>BandageBoard</h1>
      <p>Backend (Person 1) is wired up. Dashboard (Person 3) goes here.</p>
      <ul>
        <li>
          <code>GET /api/eligibility</code> — routing decisions (filters: facility, decision, payer)
        </li>
        <li>
          <code>POST /api/sync?facility=101&amp;limit=25</code> — ingest a slice
        </li>
      </ul>
    </main>
  );
}
