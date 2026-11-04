CREATE TABLE student (
  uid TEXT PRIMARY KEY CHECK (uid ~ '^[0-9]{9}$'),
  name TEXT NOT NULL,
  directory_id TEXT UNIQUE CHECK (directory_id = lower(directory_id)),
  email TEXT
);

CREATE TABLE enrollment (
  course_id INT REFERENCES course ON DELETE CASCADE,
  uid TEXT REFERENCES student ON DELETE CASCADE,
  PRIMARY KEY (course_id, uid)
);
