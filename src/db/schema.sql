CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  cwd TEXT,
  model TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  title TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  parent_uuid TEXT,
  role TEXT NOT NULL,
  content TEXT,
  content_blocks JSONB NOT NULL DEFAULT '[]',
  thinking TEXT,
  is_sidechain BOOLEAN DEFAULT FALSE,
  is_meta BOOLEAN DEFAULT FALSE,
  sequence_num INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  UNIQUE(session_id, uuid)
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_uuid TEXT NOT NULL,
  result_uuid TEXT,
  tool_use_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,
  input JSONB,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS raw_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(session_id, uuid);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_use_id ON tool_calls(tool_use_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_session ON raw_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
