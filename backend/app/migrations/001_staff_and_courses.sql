CREATE TABLE staff (
  directory_id TEXT PRIMARY KEY CHECK (directory_id = lower(directory_id)),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('instructor', 'ta'))
);

CREATE TABLE course (
  course_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL,
  term TEXT NOT NULL,
  title TEXT,
  UNIQUE (code, term)
);

CREATE TABLE course_staff (
  course_id INT REFERENCES course ON DELETE CASCADE,
  directory_id TEXT REFERENCES staff ON DELETE CASCADE,
  PRIMARY KEY (course_id, directory_id)
);
