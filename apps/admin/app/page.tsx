"use client";

import { FormEvent, useEffect, useState } from "react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3002";

interface Wish {
  id: string;
  name: string;
  wish: string;
  createdAt: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(
    null,
  );

  const [clearing, setClearing] = useState(false);

  /*
   * Загружаем пожелания после входа.
   */
  const loadWishes = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${SERVER_URL}/wishes`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          "Не удалось загрузить пожелания",
        );
      }

      const data = await response.json();

      setWishes(data);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка загрузки",
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Вход администратора.
   */
  const handleLogin = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!password.trim()) {
      return;
    }

    /*
     * Пока проверяем пароль через
     * специальный запрос к серверу.
     */
    authenticate();
  };

  const authenticate = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${SERVER_URL}/wishes`,
        {
          headers: {
            "x-admin-password": password,
          },
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        setError(
          "Неверный пароль",
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          "Не удалось подключиться к серверу",
        );
      }

      const data = await response.json();

      setWishes(data);
      setAuthenticated(true);

      /*
       * Сохраняем пароль только в памяти
       * текущей страницы.
       */
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка подключения",
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Удаление одного пожелания.
   */
  const deleteWish = async (
    id: string,
  ) => {
    const confirmed =
      window.confirm(
        "Удалить это пожелание?",
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(id);
      setError("");

      const response = await fetch(
        `${SERVER_URL}/wishes/${id}`,
        {
          method: "DELETE",
          headers: {
            "x-admin-password": password,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось удалить пожелание",
        );
      }

      setWishes((current) =>
        current.filter(
          (wish) => wish.id !== id,
        ),
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка удаления",
      );
    } finally {
      setDeletingId(null);
    }
  };

  /*
   * Удаление всех пожеланий.
   */
  const clearAll = async () => {
    const confirmed =
      window.confirm(
        `Удалить ВСЕ ${wishes.length} пожеланий?\n\nЭто действие нельзя отменить.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setClearing(true);
      setError("");

      const response = await fetch(
        `${SERVER_URL}/wishes`,
        {
          method: "DELETE",
          headers: {
            "x-admin-password": password,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось очистить пожелания",
        );
      }

      setWishes([]);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка очистки",
      );
    } finally {
      setClearing(false);
    }
  };

  /*
   * Обновление списка.
   */
  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const interval = setInterval(
      () => {
        loadWishes();
      },
      5000,
    );

    return () => {
      clearInterval(interval);
    };
  }, [authenticated]);

  /*
   * =========================
   * LOGIN
   * =========================
   */

  if (!authenticated) {
    return (
      <main className="admin-page login-page">
        <div className="login-glow glow-one" />
        <div className="login-glow glow-two" />

        <section className="login-card">
          <div className="login-icon">
            ✦
          </div>

          <div className="login-label">
            ADMIN PANEL
          </div>

          <h1>
            Управление
            <br />
            пожеланиями
          </h1>

          <p>
            Введите пароль администратора,
            чтобы продолжить.
          </p>

          <form
            onSubmit={handleLogin}
            className="login-form"
          >
            <label htmlFor="password">
              Пароль
            </label>

            <input
              id="password"
              type="password"
              value={password}
              placeholder="Введите пароль"
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              autoFocus
            />

            {error && (
              <div className="error-box">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={
                loading ||
                !password.trim()
              }
            >
              {loading
                ? "Проверяем..."
                : "Войти"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  /*
   * =========================
   * ADMIN
   * =========================
   */

  return (
    <main className="admin-page">
      <div className="admin-background">
        <div className="background-glow glow-one" />
        <div className="background-glow glow-two" />
      </div>

      <header className="admin-header">
        <div>
          <div className="admin-label">
            ADMIN PANEL
          </div>

          <h1>
            Пожелания
          </h1>

          <p>
            Управление сообщениями
          </p>
        </div>

        <button
          className="logout-button"
          onClick={() => {
            setAuthenticated(false);
            setPassword("");
          }}
        >
          Выйти
        </button>
      </header>

      <section className="stats">
        <div className="stat-card">
          <div className="stat-icon">
            ✦
          </div>

          <div>
            <div className="stat-number">
              {wishes.length}
            </div>

            <div className="stat-label">
              Всего пожеланий
            </div>
          </div>
        </div>

        <button
          className="clear-button"
          onClick={clearAll}
          disabled={
            clearing ||
            wishes.length === 0
          }
        >
          <span className="clear-icon">
            🗑
          </span>

          <span>
            {clearing
              ? "Очищаем..."
              : "Очистить всё"}
          </span>
        </button>
      </section>

      {error && (
        <div className="error-box admin-error">
          {error}
        </div>
      )}

      <section className="wishes-section">
        <div className="section-header">
          <div>
            <h2>
              Все пожелания
            </h2>

            <p>
              Новые сообщения появляются
              автоматически
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={loadWishes}
            disabled={loading}
          >
            ↻ Обновить
          </button>
        </div>

        {wishes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              ✦
            </div>

            <h3>
              Пока нет пожеланий
            </h3>

            <p>
              Когда гости начнут отправлять
              сообщения, они появятся здесь.
            </p>
          </div>
        ) : (
          <div className="wishes-list">
            {[...wishes]
              .reverse()
              .map(
                (
                  item,
                  index,
                ) => (
                  <article
                    key={item.id}
                    className="admin-wish"
                  >
                    <div className="wish-top">
                      <div className="wish-avatar">
                        {item.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="wish-info">
                        <h3>
                          {item.name}
                        </h3>

                        <span>
                          {new Date(
                            item.createdAt,
                          ).toLocaleString(
                            "ru-RU",
                          )}
                        </span>
                      </div>

                      <div className="wish-index">
                        #
                        {wishes.length -
                          index}
                      </div>
                    </div>

                    <div className="admin-wish-text">
                      {item.wish}
                    </div>

                    <button
                      className="delete-button"
                      onClick={() =>
                        deleteWish(
                          item.id,
                        )
                      }
                      disabled={
                        deletingId ===
                        item.id
                      }
                    >
                      {deletingId ===
                      item.id
                        ? "Удаляем..."
                        : "🗑 Удалить"}
                    </button>
                  </article>
                ),
              )}
          </div>
        )}
      </section>
    </main>
  );
}