"use client";

import { FormEvent, useState } from "react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "https://wishes-server.onrender.com";

export default function WishPage() {
  const [name, setName] = useState("");
  const [wish, setWish] = useState("");

  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanWish = wish.trim();

    if (!cleanName || !cleanWish || loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${SERVER_URL}/wishes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          wish: cleanWish,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Не удалось отправить пожелание");
      }

      console.log("✨ Wish sent:", data);

      setSent(true);
    } catch (err) {
      console.error("❌ Wish sending error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Не удалось отправить пожелание. Попробуйте ещё раз.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName("");
    setWish("");
    setError("");
    setSent(false);
  };

  if (sent) {
    return (
      <main className="page">
        <div className="background">
          <div className="star star1" />
          <div className="star star2" />
          <div className="star star3" />
          <div className="star star4" />
          <div className="glow glow1" />
          <div className="glow glow2" />
        </div>

        <section className="success-card">
          <div className="success-icon">✨</div>

          <h1>Пожелание отправлено!</h1>

          <p>
            Спасибо, {name.trim()}!
            <br />
            Ваше пожелание уже летит на экран 💫
          </p>

          <button
            type="button"
            className="secondary-button"
            onClick={handleReset}
          >
            Отправить ещё
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="background">
        <div className="star star1" />
        <div className="star star2" />
        <div className="star star3" />
        <div className="star star4" />
        <div className="star star5" />

        <div className="glow glow1" />
        <div className="glow glow2" />
      </div>

      <section className="wish-card">
        <div className="logo">✦</div>

        <p className="eyebrow">ВАШЕ ПОЖЕЛАНИЕ</p>

        <h1>
          Оставьте
          <br />
          своё пожелание
        </h1>

        <p className="subtitle">
          Напишите несколько тёплых слов —
          <br />
          и они появятся на большом экране ✨
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Ваше имя</label>

          <input
            id="name"
            type="text"
            placeholder="Например, Алина"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            disabled={loading}
          />

          <label htmlFor="wish">Ваше пожелание</label>

          <textarea
            id="wish"
            placeholder="Напишите своё пожелание..."
            value={wish}
            maxLength={250}
            onChange={(event) => setWish(event.target.value)}
            rows={5}
            disabled={loading}
          />

          <div className="counter">{wish.length} / 250</div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="submit-button"
            disabled={!name.trim() || !wish.trim() || loading}
          >
            <span>{loading ? "Отправляем..." : "Отправить пожелание"}</span>

            {!loading && <span className="button-icon">✦</span>}

            {loading && <span className="loading-icon">•••</span>}
          </button>
        </form>
      </section>

      <p className="bottom-text">
        Ваши слова могут стать частью этого вечера ✨
      </p>
    </main>
  );
}