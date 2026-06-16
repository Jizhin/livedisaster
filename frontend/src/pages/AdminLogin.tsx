import { Navbar } from "../components/Navbar";

export function AdminLogin() {
  return (
    <main className="page admin-page">
      <Navbar />
      <section className="admin-login">
        <h1>Admin Login</h1>
        <input placeholder="Email" />
        <input placeholder="Password" type="password" />
        <button className="primary-button">Continue</button>
      </section>
    </main>
  );
}

