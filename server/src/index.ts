import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { Pool } from "pg";
import crypto from "crypto";

const app = express();

const httpServer = createServer(app);

/* =========================
   SOCKET.IO
========================= */

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
  },
});

/* =========================
   EXPRESS
========================= */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
  }),
);

app.use(express.json());

/* =========================
   CONFIG
========================= */

const PORT = Number(process.env.PORT) || 3002;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "admin123";

const DATABASE_URL =
  process.env.DATABASE_URL;

/* =========================
   TYPES
========================= */

interface Wish {
  id: string;
  name: string;
  wish: string;
  createdAt: string;
}

/* =========================
   DATABASE
========================= */

let pool: Pool | null = null;

/*
 * Локально DATABASE_URL пока может отсутствовать.
 *
 * В этом случае проект продолжит работать
 * в памяти.
 *
 * На Render DATABASE_URL будет обязательно
 * подключён к PostgreSQL.
 */

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

/* =========================
   MEMORY FALLBACK
========================= */

const memoryWishes: Wish[] = [];

/* =========================
   DATABASE INIT
========================= */

async function initializeDatabase() {
  if (!pool) {
    console.log(
      "⚠️ DATABASE_URL не задан.",
    );

    console.log(
      "⚠️ Используется временное хранение в памяти.",
    );

    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      wish VARCHAR(250) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  console.log(
    "🗄 PostgreSQL database connected",
  );

  console.log(
    "📦 Wishes table is ready",
  );
}

/* =========================
   GET ALL WISHES
========================= */

async function getWishes(): Promise<Wish[]> {
  /*
   * PostgreSQL
   */

  if (pool) {
    const result = await pool.query(`
      SELECT
        id,
        name,
        wish,
        created_at
      FROM wishes
      ORDER BY created_at ASC;
    `);

    return result.rows.map(
      (row) => ({
        id: row.id,
        name: row.name,
        wish: row.wish,
        createdAt:
          new Date(
            row.created_at,
          ).toISOString(),
      }),
    );
  }

  /*
   * Memory fallback
   */

  return [...memoryWishes];
}

/* =========================
   GET ONE WISH
========================= */

async function getWishById(
  id: string,
): Promise<Wish | null> {
  if (pool) {
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          wish,
          created_at
        FROM wishes
        WHERE id = $1;
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      name: row.name,
      wish: row.wish,
      createdAt:
        new Date(
          row.created_at,
        ).toISOString(),
    };
  }

  return (
    memoryWishes.find(
      (item) => item.id === id,
    ) || null
  );
}

/* =========================
   CREATE WISH
========================= */

async function createWish(
  wish: Wish,
): Promise<Wish> {
  if (pool) {
    await pool.query(
      `
        INSERT INTO wishes (
          id,
          name,
          wish,
          created_at
        )
        VALUES ($1, $2, $3, $4);
      `,
      [
        wish.id,
        wish.name,
        wish.wish,
        wish.createdAt,
      ],
    );

    return wish;
  }

  memoryWishes.push(wish);

  return wish;
}

/* =========================
   DELETE ONE WISH
========================= */

async function deleteWish(
  id: string,
): Promise<Wish | null> {
  const wish =
    await getWishById(id);

  if (!wish) {
    return null;
  }

  if (pool) {
    await pool.query(
      `
        DELETE FROM wishes
        WHERE id = $1;
      `,
      [id],
    );

    return wish;
  }

  const index =
    memoryWishes.findIndex(
      (item) => item.id === id,
    );

  if (index !== -1) {
    memoryWishes.splice(
      index,
      1,
    );
  }

  return wish;
}

/* =========================
   DELETE ALL
========================= */

async function deleteAllWishes(): Promise<
  Wish[]
> {
  const wishes =
    await getWishes();

  if (pool) {
    await pool.query(`
      DELETE FROM wishes;
    `);

    return wishes;
  }

  memoryWishes.length = 0;

  return wishes;
}

/* =========================
   ADMIN AUTH
========================= */

function checkAdminPassword(
  req: express.Request,
  res: express.Response,
): boolean {
  const password =
    req.headers[
      "x-admin-password"
    ];

  if (
    typeof password !==
      "string" ||
    password !==
      ADMIN_PASSWORD
  ) {
    res.status(401).json({
      error:
        "Неверный пароль администратора",
    });

    return false;
  }

  return true;
}

/* =========================
   BASIC ROUTES
========================= */

app.get("/", async (_req, res) => {
  try {
    const wishes =
      await getWishes();

    res.json({
      status: "ok",
      service: "wishes-server",
      storage: pool
        ? "postgresql"
        : "memory",
      wishes:
        wishes.length,
    });
  } catch (error) {
    console.error(
      "❌ Root route error:",
      error,
    );

    res.status(500).json({
      status: "error",
    });
  }
});

/* =========================
   HEALTH
========================= */

app.get(
  "/health",
  async (_req, res) => {
    try {
      if (pool) {
        await pool.query(
          "SELECT 1",
        );
      }

      res.json({
        status: "ok",
        database: pool
          ? "connected"
          : "memory",
      });
    } catch (error) {
      console.error(
        "❌ Health check failed:",
        error,
      );

      res.status(503).json({
        status: "error",
        database: "disconnected",
      });
    }
  },
);

/* =========================
   GET WISHES
========================= */

app.get(
  "/wishes",
  async (_req, res) => {
    try {
      const wishes =
        await getWishes();

      res.json(wishes);
    } catch (error) {
      console.error(
        "❌ Failed to get wishes:",
        error,
      );

      res.status(500).json({
        error:
          "Не удалось получить пожелания",
      });
    }
  },
);

/* =========================
   CREATE WISH
========================= */

app.post(
  "/wishes",
  async (req, res) => {
    try {
      const {
        name,
        wish,
      } = req.body;

      if (
        typeof name !==
          "string" ||
        typeof wish !==
          "string" ||
        !name.trim() ||
        !wish.trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              "Имя и пожелание обязательны",
          });
      }

      const newWish: Wish = {
        id: crypto.randomUUID(),

        name: name
          .trim()
          .slice(0, 40),

        wish: wish
          .trim()
          .slice(0, 250),

        createdAt:
          new Date().toISOString(),
      };

      await createWish(
        newWish,
      );

      /*
       * Отправляем пожелание
       * всем подключённым клиентам.
       */

      io.emit(
        "new-wish",
        newWish,
      );

      console.log(
        `✨ New wish: ${newWish.name}`,
      );

      return res
        .status(201)
        .json(newWish);
    } catch (error) {
      console.error(
        "❌ Failed to create wish:",
        error,
      );

      return res
        .status(500)
        .json({
          error:
            "Не удалось сохранить пожелание",
        });
    }
  },
);

/* =========================
   DELETE ONE WISH
========================= */

app.delete(
  "/wishes/:id",
  async (req, res) => {
    if (
      !checkAdminPassword(
        req,
        res,
      )
    ) {
      return;
    }

    try {
      const { id } =
        req.params;

      const deletedWish =
        await deleteWish(id);

      if (!deletedWish) {
        return res
          .status(404)
          .json({
            error:
              "Пожелание не найдено",
          });
      }

      /*
       * Сообщаем экрану
       * и другим клиентам,
       * что пожелание удалено.
       */

      io.emit(
        "wish-deleted",
        deletedWish.id,
      );

      console.log(
        `🗑 Deleted wish: ${deletedWish.name}`,
      );

      return res.json({
        success: true,
        deleted:
          deletedWish,
      });
    } catch (error) {
      console.error(
        "❌ Failed to delete wish:",
        error,
      );

      return res
        .status(500)
        .json({
          error:
            "Не удалось удалить пожелание",
        });
    }
  },
);

/* =========================
   DELETE ALL WISHES
========================= */

app.delete(
  "/wishes",
  async (req, res) => {
    if (
      !checkAdminPassword(
        req,
        res,
      )
    ) {
      return;
    }

    try {
      const deletedWishes =
        await deleteAllWishes();

      const deletedIds =
        deletedWishes.map(
          (item) => item.id,
        );

      const deletedCount =
        deletedWishes.length;

      /*
       * Сообщаем всем экранам
       * очистить пожелания.
       */

      io.emit(
        "wishes-cleared",
        deletedIds,
      );

      console.log(
        `💥 Deleted all wishes: ${deletedCount}`,
      );

      return res.json({
        success: true,
        deletedCount,
      });
    } catch (error) {
      console.error(
        "❌ Failed to clear wishes:",
        error,
      );

      return res
        .status(500)
        .json({
          error:
            "Не удалось очистить пожелания",
        });
    }
  },
);

/* =========================
   SOCKET.IO
========================= */

io.on(
  "connection",
  async (socket) => {
    console.log(
      `🟢 Client connected: ${socket.id}`,
    );

    try {
      /*
       * При подключении отправляем
       * все сохранённые пожелания.
       */

      const wishes =
        await getWishes();

      socket.emit(
        "initial-wishes",
        wishes,
      );
    } catch (error) {
      console.error(
        "❌ Failed to send initial wishes:",
        error,
      );

      socket.emit(
        "initial-wishes",
        [],
      );
    }

    socket.on(
      "disconnect",
      () => {
        console.log(
          `🔴 Client disconnected: ${socket.id}`,
        );
      },
    );
  },
);

/* =========================
   START SERVER
========================= */

async function startServer() {
  try {
    /*
     * Сначала проверяем PostgreSQL
     * и создаём таблицу.
     */

    await initializeDatabase();

    /*
     * Только после этого запускаем
     * HTTP + Socket.IO сервер.
     */

    httpServer.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log("");

        console.log(
          "✨ Wishes server started",
        );

        console.log(
          `🚀 Port: ${PORT}`,
        );

        console.log(
          `💚 Health: /health`,
        );

        console.log(
          `🗄 Storage: ${
            pool
              ? "PostgreSQL"
              : "Memory"
          }`,
        );

        console.log(
          `🔐 Admin password: ${
            process.env
              .ADMIN_PASSWORD
              ? "from environment"
              : "admin123"
          }`,
        );

        console.log("");
      },
    );
  } catch (error) {
    console.error("");

    console.error(
      "❌ Failed to start server:",
      error,
    );

    console.error("");

    process.exit(1);
  }
}

startServer();