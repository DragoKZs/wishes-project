"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  "http://localhost:3002";

const ANIMATION_INTERVAL = 900;

interface Wish {
  id: string;
  name: string;
  wish: string;
  createdAt: string;
}

interface BackgroundStar {
  id: number;
  x: number;
  y: number;
  delay: number;
  duration: number;
  size: number;
}

function createBackgroundStars(): BackgroundStar[] {
  return Array.from({ length: 100 }, (_, index) => ({
    id: index,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 2 + Math.random() * 4,
    size: Math.random() > 0.9 ? 3 : 2,
  }));
}

export default function ScreenPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [connected, setConnected] =
    useState(false);

  const [visibleWishes, setVisibleWishes] =
    useState<Set<string>>(
      () => new Set(),
    );

  const [backgroundStars] =
    useState<BackgroundStar[]>(() =>
      createBackgroundStars(),
    );

  /*
   * Ссылки на карточки.
   */
  const wishRefs = useRef<
    Map<string, HTMLElement>
  >(new Map());

  /*
   * Intersection Observer.
   */
  const observerRef =
    useRef<IntersectionObserver | null>(
      null,
    );

  /*
   * Очередь анимации.
   */
  const animationQueueRef =
    useRef<string[]>([]);

  /*
   * Пожелания, которые уже попали
   * в очередь.
   */
  const queuedWishesRef =
    useRef<Set<string>>(new Set());

  /*
   * Идёт ли сейчас анимация.
   */
  const isAnimatingRef =
    useRef(false);

  /*
   * Таймер очереди.
   */
  const animationTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  /*
   * =========================
   * УДАЛЕНИЕ ИЗ ОЧЕРЕДИ
   * =========================
   */

  const removeFromAnimationQueue = (
    id: string,
  ) => {
    animationQueueRef.current =
      animationQueueRef.current.filter(
        (wishId) => wishId !== id,
      );

    queuedWishesRef.current.delete(id);
  };

  /*
   * =========================
   * СЛЕДУЮЩАЯ АНИМАЦИЯ
   * =========================
   */

  const processNextWish = () => {
    if (isAnimatingRef.current) {
      return;
    }

    /*
     * Берём следующее пожелание.
     */
    const nextId =
      animationQueueRef.current.shift();

    if (!nextId) {
      return;
    }

    /*
     * Проверяем, существует ли оно ещё.
     *
     * Это важно, если администратор
     * удалил его, пока оно ждало очереди.
     */
    const stillExists =
      wishes.some(
        (wish) => wish.id === nextId,
      );

    if (!stillExists) {
      queuedWishesRef.current.delete(
        nextId,
      );

      processNextWish();

      return;
    }

    isAnimatingRef.current = true;

    /*
     * Запускаем анимацию только
     * этого пожелания.
     */
    setVisibleWishes((current) => {
      if (current.has(nextId)) {
        return current;
      }

      const next = new Set(current);

      next.add(nextId);

      return next;
    });

    /*
     * После 900 мс запускаем следующее.
     */
    animationTimerRef.current =
      setTimeout(() => {
        isAnimatingRef.current = false;

        queuedWishesRef.current.delete(
          nextId,
        );

        processNextWish();
      }, ANIMATION_INTERVAL);
  };

  /*
   * =========================
   * ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
   * =========================
   */

  const addToAnimationQueue = (
    id: string,
  ) => {
    if (
      queuedWishesRef.current.has(id)
    ) {
      return;
    }

    if (visibleWishes.has(id)) {
      return;
    }

    /*
     * Проверяем, что пожелание
     * действительно существует.
     */
    const exists = wishes.some(
      (wish) => wish.id === id,
    );

    if (!exists) {
      return;
    }

    queuedWishesRef.current.add(id);

    animationQueueRef.current.push(id);

    processNextWish();
  };

  /*
   * =========================
   * INTERSECTION OBSERVER
   * =========================
   */

  useEffect(() => {
    observerRef.current =
      new IntersectionObserver(
        (entries) => {
          entries.forEach(
            (entry) => {
              if (
                !entry.isIntersecting
              ) {
                return;
              }

              const id =
                entry.target.getAttribute(
                  "data-wish-id",
                );

              if (!id) {
                return;
              }

              addToAnimationQueue(id);

              /*
               * После попадания в очередь
               * больше не наблюдаем за этой
               * карточкой.
               */
              observerRef.current?.unobserve(
                entry.target,
              );
            },
          );
        },
        {
          threshold: 0.15,
          rootMargin:
            "0px 0px -30px 0px",
        },
      );

    return () => {
      observerRef.current?.disconnect();

      if (
        animationTimerRef.current
      ) {
        clearTimeout(
          animationTimerRef.current,
        );
      }
    };
  }, [wishes, visibleWishes]);

  /*
   * =========================
   * НАБЛЮДЕНИЕ ЗА НОВЫМИ
   * =========================
   */

  useEffect(() => {
    const observer =
      observerRef.current;

    if (!observer) {
      return;
    }

    wishRefs.current.forEach(
      (element) => {
        if (!element) {
          return;
        }

        const id =
          element.getAttribute(
            "data-wish-id",
          );

        if (!id) {
          return;
        }

        if (
          visibleWishes.has(id) ||
          queuedWishesRef.current.has(id)
        ) {
          return;
        }

        observer.observe(element);
      },
    );
  }, [
    wishes,
    visibleWishes,
  ]);

  /*
   * =========================
   * ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
   * =========================
   */

  useEffect(() => {
    const socket: Socket = io(
      SERVER_URL,
      {
        transports: [
          "websocket",
          "polling",
        ],
      },
    );

    /*
     * Подключение.
     */
    socket.on("connect", () => {
      console.log(
        "🟢 Connected to wishes server",
      );

      setConnected(true);
    });

    /*
     * Отключение.
     */
    socket.on("disconnect", () => {
      console.log(
        "🔴 Disconnected from wishes server",
      );

      setConnected(false);
    });

    /*
     * =========================
     * СТАРЫЕ ПОЖЕЛАНИЯ
     * =========================
     */

    socket.on(
      "initial-wishes",
      (initialWishes: Wish[]) => {
        console.log(
          "📦 Initial wishes:",
          initialWishes,
        );

        setWishes(initialWishes);

        /*
         * На перезагрузке экрана
         * очищаем старую очередь.
         */
        animationQueueRef.current = [];

        queuedWishesRef.current.clear();

        setVisibleWishes(
          new Set(),
        );

        isAnimatingRef.current =
          false;
      },
    );

    /*
     * =========================
     * НОВОЕ ПОЖЕЛАНИЕ
     * =========================
     */

    socket.on(
      "new-wish",
      (wish: Wish) => {
        console.log(
          "✨ New wish:",
          wish,
        );

        setWishes((current) => [
          ...current,
          wish,
        ]);
      },
    );

    /*
     * =========================
     * УДАЛЕНИЕ ОДНОГО
     * =========================
     */

    socket.on(
      "wish-deleted",
      (deletedId: string) => {
        console.log(
          "🗑 Wish deleted:",
          deletedId,
        );

        /*
         * Убираем из списка.
         */
        setWishes((current) =>
          current.filter(
            (wish) =>
              wish.id !== deletedId,
          ),
        );

        /*
         * Убираем из очереди.
         */
        removeFromAnimationQueue(
          deletedId,
        );

        /*
         * Убираем из уже показанных.
         */
        setVisibleWishes(
          (current) => {
            if (
              !current.has(
                deletedId,
              )
            ) {
              return current;
            }

            const next = new Set(
              current,
            );

            next.delete(deletedId);

            return next;
          },
        );

        /*
         * Удаляем ссылку.
         */
        wishRefs.current.delete(
          deletedId,
        );
      },
    );

    /*
     * =========================
     * ОЧИСТКА ВСЕХ
     * =========================
     */

    socket.on(
      "wishes-cleared",
      () => {
        console.log(
          "💥 All wishes cleared",
        );

        /*
         * Очищаем пожелания.
         */
        setWishes([]);

        /*
         * Очищаем анимационную очередь.
         */
        animationQueueRef.current = [];

        queuedWishesRef.current.clear();

        /*
         * Очищаем отображённые.
         */
        setVisibleWishes(
          new Set(),
        );

        /*
         * Останавливаем текущую очередь.
         */
        isAnimatingRef.current =
          false;

        /*
         * Удаляем таймер.
         */
        if (
          animationTimerRef.current
        ) {
          clearTimeout(
            animationTimerRef.current,
          );

          animationTimerRef.current =
            null;
        }

        /*
         * Очищаем ссылки.
         */
        wishRefs.current.clear();
      },
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  /*
   * =========================
   * REF
   * =========================
   */

  const setWishRef = (
    id: string,
    element: HTMLElement | null,
  ) => {
    if (element) {
      wishRefs.current.set(
        id,
        element,
      );

      if (
        !visibleWishes.has(id) &&
        !queuedWishesRef.current.has(
          id,
        )
      ) {
        observerRef.current?.observe(
          element,
        );
      }
    } else {
      wishRefs.current.delete(id);
    }
  };

  /*
   * =========================
   * RENDER
   * =========================
   */

  return (
    <main className="screen">
      {/* BACKGROUND */}

      <div className="stars">
        {backgroundStars.map(
          (star) => (
            <span
              key={star.id}
              className="background-star"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
              }}
            />
          ),
        )}
      </div>

      <div className="nebula nebula-one" />

      <div className="nebula nebula-two" />

      {/* HEADER */}

      <header className="screen-header">
        <div className="screen-title">
          <span className="title-star">
            ✦
          </span>

          <div>
            <div className="title-small">
              ВАШИ СЛОВА
            </div>

            <div className="title-main">
              ПОЖЕЛАНИЯ
            </div>
          </div>
        </div>

        <div
          className={`connection ${
            connected
              ? "connection-online"
              : "connection-offline"
          }`}
        >
          <span className="connection-dot" />

          {connected
            ? "ONLINE"
            : "CONNECTING"}
        </div>
      </header>

      {/* WISHES */}

      {wishes.length === 0 ? (
        <div className="waiting">
          <div className="waiting-star">
            ✦
          </div>

          <h1>
            Оставьте своё пожелание
          </h1>

          <p>
            Оно появится здесь
            <br />
            в виде падающей звезды
          </p>
        </div>
      ) : (
        <section className="wish-field">
          {wishes.map(
            (item, index) => {
              const isVisible =
                visibleWishes.has(
                  item.id,
                );

              return (
                <article
                  key={item.id}
                  ref={(element) =>
                    setWishRef(
                      item.id,
                      element,
                    )
                  }
                  data-wish-id={
                    item.id
                  }
                  className={`wish-message ${
                    isVisible
                      ? "wish-message-visible"
                      : "wish-message-hidden"
                  }`}
                >
                  <div className="shooting-star">
                    <span />
                    <span />
                    <span />
                  </div>

                  <div className="wish-card-screen">
                    <div className="wish-number">
                      #{index + 1}
                    </div>

                    <div className="wish-name">
                      {item.name}
                    </div>

                    <div className="wish-text">
                      {item.wish}
                    </div>

                    <div className="wish-sparkles">
                      ✦ ✧ ✦
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </section>
      )}

      {/* FOOTER */}

      <footer className="screen-footer">
        <span>✦</span>

        Напишите пожелание —
        и оно появится на экране

        <span>✦</span>
      </footer>
    </main>
  );
}