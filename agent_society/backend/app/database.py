import aiosqlite
from contextlib import asynccontextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "society.db"


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                model TEXT NOT NULL,
                fallback_model TEXT,
                temperature REAL NOT NULL,
                personality_traits TEXT NOT NULL,
                expertise TEXT NOT NULL,
                emoji TEXT NOT NULL,
                color TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                scenario TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                result_summary TEXT,
                name TEXT,
                max_level INTEGER NOT NULL DEFAULT 3
            );

            -- Event-sourced timeline: every meeting event, ordered + timestamped.
            -- The whole UI (office, terminal view, replay, memory states) is a
            -- pure function of this log.
            CREATE TABLE IF NOT EXISTS meeting_events (
                meeting_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                t_ms INTEGER NOT NULL,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (meeting_id, seq),
                FOREIGN KEY (meeting_id) REFERENCES meetings(id)
            );

            CREATE TABLE IF NOT EXISTS meeting_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            );

            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                position TEXT NOT NULL,
                confidence REAL NOT NULL,
                reasoning TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            );

            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                meeting_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            );

            CREATE TABLE IF NOT EXISTS relationships (
                agent_id TEXT NOT NULL,
                target_agent_id TEXT NOT NULL,
                trust_score REAL NOT NULL DEFAULT 0.0,
                interaction_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (agent_id, target_agent_id),
                FOREIGN KEY (agent_id) REFERENCES agents(id),
                FOREIGN KEY (target_agent_id) REFERENCES agents(id)
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            );
        """)

        # Idempotent migrations for columns added after initial release.
        async with db.execute("PRAGMA table_info(agents)") as cursor:
            cols = {row[1] async for row in cursor}
        if "fallback_model" not in cols:
            await db.execute("ALTER TABLE agents ADD COLUMN fallback_model TEXT")

        async with db.execute("PRAGMA table_info(meetings)") as cursor:
            mcols = {row[1] async for row in cursor}
        if "name" not in mcols:
            await db.execute("ALTER TABLE meetings ADD COLUMN name TEXT")
        if "max_level" not in mcols:
            await db.execute("ALTER TABLE meetings ADD COLUMN max_level INTEGER NOT NULL DEFAULT 3")

        await db.commit()
