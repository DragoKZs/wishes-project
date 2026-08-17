"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3002";

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
  const [connected, setConnected] = useState(false);

  const [visibleWishes, setVisibleWishes] = useState<Set<string>>(
    () => new Set(),
  );

  const [backgroundStars] = useState<BackgroundStar[]>(() =>
    createBackgroundStars(),
  );

  /*
   * =========================================================
   * REFS
   * =========================================================
   */

  const wishRefs = useRef<Map<string, HTMLElement>>(new Map());

  const observerRef = useRef<IntersectionObserver | null>(null);

  const animationQueueRef = useRef<string[]>([]);

  const queuedWishesRef = useRef<Set<string>>(new Set());

  const isAnimatingRef = useRef(false);

  const animationTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Храним актуальные данные в refs.
   *
   * Это важно:
   * IntersectionObserver создаётся один раз и не должен
   * пересоздаваться при каждом setState.
   */

  const wishesRef = useRef<Wish[]>([]);
  const visibleWishesRef = useRef<Set<string>>(new Set());

  /*
   * =========================================================
   * УДАЛЕНИЕ ИЗ ОЧЕРЕДИ
   * =========================================================
   */

  const removeFromAnimationQueue = (id: string) => {
    animationQueueRef.current =
      animationQueueRef.current.filter(
        (wishId) => wishId !== id,
      );

    queuedWishesRef.current.delete(id);
  };

  /*
   * =========================================================
   * СЛЕДУЮЩАЯ АНИМАЦИЯ
   * =========================================================
   */

  const processNextWish = () => {
    /*
     * Если сейчас уже идёт анимация,
     * ничего не делаем.
     */

    if (isAnimatingRef.current) {
      return;
    }

    /*
     * Берём следующее пожелание из очереди.
     */

    const nextId =
      animationQueueRef.current.shift();

    if (!nextId) {
      return;
    }

    /*
     * Проверяем, существует ли пожелание ещё.
     *
     * Оно могло быть удалено администратором,
     * пока ожидало своей очереди.
     */

    const stillExists =
      wishesRef.current.some(
        (wish) => wish.id === nextId,
      );

    if (!stillExists) {
      queuedWishesRef.current.delete(nextId);

      /*
       * Переходим сразу к следующему.
       */

      processNextWish();

      return;
    }

    /*
     * Запускаем анимацию.
     */

    isAnimatingRef.current = true;

    setVisibleWishes((current) => {
      if (current.has(nextId)) {
        visibleWishesRef.current = current;

        return current;
      }

      const next = new Set(current);

      next.add(nextId);

      visibleWishesRef.current = next;

      return next;
    });

    /*
     * Через 900 мс запускаем следующую карточку.
     */

    animationTimerRef.current = setTimeout(() => {
      isAnimatingRef.current = false;

      queuedWishesRef.current.delete(nextId);

      animationTimerRef.current = null;

      processNextWish();
    }, ANIMATION_INTERVAL);
  };

  /*
   * =========================================================
   * ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
   * =========================================================
   */

  const addToAnimationQueue = (id: string) => {
    /*
     * Уже в очереди?
     */

    if (queuedWishesRef.current.has(id)) {
      return;
    }

    /*
     * Уже показано?
     */

    if (visibleWishesRef.current.has(id)) {
      return;
    }

    /*
     * Проверяем существование пожелания.
     */

    const exists = wishesRef.current.some(
      (wish) => wish.id === id,
    );

    if (!exists) {
      return;
    }

    /*
     * Добавляем в очередь.
     */

    queuedWishesRef.current.add(id);

    animationQueueRef.current.push(id);

    /*
     * Запускаем обработку.
     */

    processNextWish();
  };

  /*
   * =========================================================
   * INTERSECTION OBSERVER
   * =========================================================
   *
   * ВАЖНО:
   * Observer создаётся ТОЛЬКО ОДИН РАЗ.
   *
   * Раньше он пересоздавался при каждом изменении wishes /
   * visibleWishes, из-за чего уничтожался таймер очереди.
   */

  useEffect(() => {
    const observer =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
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
             * больше не наблюдаем эту карточку.
             */

            observer.unobserve(
              entry.target,
            );
          });
        },
        {
          threshold: 0.15,
          rootMargin:
            "0px 0px -30px 0px",
        },
      );

    observerRef.current = observer;

    /*
     * Cleanup только при размонтировании страницы.
     */

    return () => {
      observer.disconnect();

      observerRef.current = null;

      if (animationTimerRef.current) {
        clearTimeout(
          animationTimerRef.current,
        );

        animationTimerRef.current = null;
      }

      animationQueueRef.current = [];

      queuedWishesRef.current.clear();

      isAnimatingRef.current = false;
    };
  }, []);

  /*
   * =========================================================
   * НАБЛЮДЕНИЕ ЗА КАРТОЧКАМИ
   * =========================================================
   *
   * Когда список пожеланий изменился,
   * подключаем новые DOM-элементы к observer.
   */

  useEffect(() => {
    const observer =
      observerRef.current;

    if (!observer) {
      return;
    }

    wishRefs.current.forEach(
      (element, id) => {
        if (!element) {
          return;
        }

        if (
          visibleWishesRef.current.has(id) ||
          queuedWishesRef.current.has(id)
        ) {
          return;
        }

        observer.observe(element);
      },
    );
  }, [wishes]);

  /*
   * =========================================================
   * ПОДКЛЮЧЕНИЕ К SERVER / SOCKET.IO
   * =========================================================
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
     * CONNECT
     */

    socket.on("connect", () => {
      console.log(
        "🟢 Connected to wishes server",
      );

      setConnected(true);
    });

    /*
     * DISCONNECT
     */

    socket.on("disconnect", () => {
      console.log(
        "🔴 Disconnected from wishes server",
      );

      setConnected(false);
    });

    /*
     * =======================================================
     * INITIAL WISHES
     * =======================================================
     */

    socket.on(
      "initial-wishes",
      (initialWishes: Wish[]) => {
        console.log(
          "📦 Initial wishes:",
          initialWishes,
        );

        /*
         * Обновляем refs.
         */

        wishesRef.current =
          initialWishes;

        /*
         * Обновляем React state.
         */

        setWishes(initialWishes);

        /*
         * Полностью сбрасываем очередь.
         */

        animationQueueRef.current = [];

        queuedWishesRef.current.clear();

        visibleWishesRef.current =
          new Set();

        setVisibleWishes(
          new Set(),
        );

        /*
         * Останавливаем текущую анимацию.
         */

        isAnimatingRef.current = false;

        if (animationTimerRef.current) {
          clearTimeout(
            animationTimerRef.current,
          );

          animationTimerRef.current = null;
        }
      },
    );

    /*
     * =======================================================
     * НОВОЕ ПОЖЕЛАНИЕ
     * =======================================================
     */

    socket.on(
      "new-wish",
      (wish: Wish) => {
        console.log(
          "✨ New wish:",
          wish,
        );

        /*
         * Добавляем в актуальный ref.
         */

        wishesRef.current = [
          ...wishesRef.current,
          wish,
        ];

        /*
         * Добавляем в React state.
         */

        setWishes((current) => [
          ...current,
          wish,
        ]);

        /*
         * Карточка будет автоматически
         * зарегистрирована observer после render.
         */
      },
    );

    /*
     * =======================================================
     * УДАЛЕНИЕ ОДНОГО ПОЖЕЛАНИЯ
     * =======================================================
     */

    socket.on(
      "wish-deleted",
      (deletedId: string) => {
        console.log(
          "🗑 Wish deleted:",
          deletedId,
        );

        /*
         * Удаляем из актуального ref.
         */

        wishesRef.current =
          wishesRef.current.filter(
            (wish) =>
              wish.id !== deletedId,
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
         * Убираем из отображённых.
         */

        if (
          visibleWishesRef.current.has(
            deletedId,
          )
        ) {
          const next = new Set(
            visibleWishesRef.current,
          );

          next.delete(deletedId);

          visibleWishesRef.current =
            next;

          setVisibleWishes(next);
        }

        /*
         * Удаляем DOM reference.
         */

        wishRefs.current.delete(
          deletedId,
        );
      },
    );

    /*
     * =======================================================
     * ОЧИСТКА ВСЕХ
     * =======================================================
     */

    socket.on(
      "wishes-cleared",
      () => {
        console.log(
          "💥 All wishes cleared",
        );

        /*
         * Очищаем refs.
         */

        wishesRef.current = [];

        visibleWishesRef.current =
          new Set();

        /*
         * Очищаем state.
         */

        setWishes([]);

        setVisibleWishes(
          new Set(),
        );

        /*
         * Очищаем очередь.
         */

        animationQueueRef.current = [];

        queuedWishesRef.current.clear();

        /*
         * Останавливаем анимацию.
         */

        isAnimatingRef.current = false;

        if (animationTimerRef.current) {
          clearTimeout(
            animationTimerRef.current,
          );

          animationTimerRef.current = null;
        }

        /*
         * Очищаем ссылки на DOM.
         */

        wishRefs.current.clear();
      },
    );

    /*
     * CLEANUP SOCKET
     */

    return () => {
      socket.disconnect();
    };
  }, []);

  /*
   * =========================================================
   * REF ДЛЯ КАРТОЧКИ
   * =========================================================
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

      /*
       * Если карточка ещё не показана
       * и не находится в очереди —
       * начинаем наблюдать.
       */

      if (
        !visibleWishesRef.current.has(
          id,
        ) &&
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
   * =========================================================
   * RENDER
   * =========================================================
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