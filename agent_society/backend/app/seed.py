import asyncio
import json
from app.database import init_db, get_db
from app.agents import AGENT_DEFINITIONS


async def seed():
    await init_db()
    async with get_db() as db:
        for agent in AGENT_DEFINITIONS:
            # UPSERT so model/personality changes in code propagate to an existing DB
            await db.execute(
                """
                INSERT INTO agents
                    (id, name, role, model, fallback_model, temperature, personality_traits, expertise, emoji, color)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    role = excluded.role,
                    model = excluded.model,
                    fallback_model = excluded.fallback_model,
                    temperature = excluded.temperature,
                    personality_traits = excluded.personality_traits,
                    expertise = excluded.expertise,
                    emoji = excluded.emoji,
                    color = excluded.color
                """,
                (
                    agent["id"],
                    agent["name"],
                    agent["role"],
                    agent["model"],
                    agent.get("fallback_model"),
                    agent["temperature"],
                    json.dumps(agent["personality_traits"]),
                    json.dumps(agent["expertise"]),
                    agent["emoji"],
                    agent["color"],
                ),
            )

        # Seed initial neutral relationships between all agent pairs
        agent_ids = [a["id"] for a in AGENT_DEFINITIONS]
        for i, aid in enumerate(agent_ids):
            for j, bid in enumerate(agent_ids):
                if aid != bid:
                    await db.execute(
                        """
                        INSERT OR IGNORE INTO relationships (agent_id, target_agent_id, trust_score, interaction_count)
                        VALUES (?, ?, 0.0, 0)
                        """,
                        (aid, bid),
                    )

        await db.commit()
    print(f"Seeded {len(AGENT_DEFINITIONS)} agents.")


if __name__ == "__main__":
    asyncio.run(seed())
