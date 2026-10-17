-- Migration number: 0001 	 2026-10-10T02:18:16.796Z

-- 1. Votaciones
CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

-- 2. Candidatos u opciones
CREATE TABLE options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id)
    ON DELETE CASCADE,
  UNIQUE (poll_id, id),
  UNIQUE (poll_id, position)
);

-- 3. Participantes autorizados
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id)
    ON DELETE CASCADE,
  UNIQUE (poll_id, credential_hash),
  UNIQUE (poll_id, id)
);

-- 4. Votos
CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id, option_id)
    REFERENCES options(poll_id, id),
  FOREIGN KEY (poll_id, participant_id)
    REFERENCES participants(poll_id, id),
  UNIQUE (poll_id, participant_id)
);

CREATE INDEX idx_options_poll
ON options(poll_id);

CREATE INDEX idx_votes_poll
ON votes(poll_id);
