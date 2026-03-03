import sqlite3 from 'sqlite3';
import { v4 as uuid } from 'uuid';

const db = new sqlite3.Database('data/ai-rpg.sqlite');
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (error) => (error ? reject(error) : resolve())));

const gameId = 'the_city_of_doors';

const playerBackground = `The male protagonist—a middle‑class, middle‑aged, well‑educated computer programmer. Handsome, muscular, tall, white, blonde with blue eyes. Shaved head with a two‑foot‑long, braided, multicolored beard (colors change weekly). A bohemian. At work, he dresses toned‑down (polo shirts, slacks, quarter‑zips) like a Viking in Silicon Valley. On weekends, torn‑off sleeves and jeans like a wild man. Enjoys evenings in well‑tailored suits. Works as an IT director for a school district and lives in a close‑knit Detroit suburb.`;

const supportBackground = `The female protagonist—a middle‑class, middle‑aged, doctorate‑holding former professor turned housewife. A beautiful black woman, slender with large breasts, shoulder‑length dreadlocks. Wears revealing tops and pixie skirts/dresses that show off her figure. A modern beatnik who loves a protest. Mother of three daughters: Ellington (10), Cosette (7), Sabine (3). Lives with Peter in Grosse Pointe. She is a part‑time professor of Education at Wayne State University and a stay‑at‑home mom. Rhiannon is shy and timid.`;

try {
  await run('PRAGMA foreign_keys = ON');

  await run(
    "INSERT INTO game_players (id, game_id, role, name, gender, background, updated_at) VALUES (?, ?, 'player', ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(game_id, role) DO UPDATE SET name = excluded.name, gender = excluded.gender, background = excluded.background, updated_at = CURRENT_TIMESTAMP",
    [uuid(), gameId, 'Peter Surowski', 'Male', playerBackground]
  );

  await run(
    "INSERT INTO game_players (id, game_id, role, name, gender, background, updated_at) VALUES (?, ?, 'support', ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(game_id, role) DO UPDATE SET name = excluded.name, gender = excluded.gender, background = excluded.background, updated_at = CURRENT_TIMESTAMP",
    [uuid(), gameId, 'Rhiannon Little-Surowski', 'Female', supportBackground]
  );

  const players = await new Promise((resolve, reject) =>
    db.all('SELECT role, name FROM game_players WHERE game_id = ? ORDER BY role', [gameId], (error, rows) =>
      error ? reject(error) : resolve(rows)
    )
  );

  console.log('seeded player profiles:');
  console.log(JSON.stringify(players, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
