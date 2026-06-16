CREATE TYPE reportstatus AS ENUM ('new', 'verified', 'disputed', 'resolved', 'rejected');
CREATE TYPE verificationkind AS ENUM ('confirm', 'incorrect', 'resolved');

CREATE TABLE districts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  reporter_name VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  status reportstatus NOT NULL DEFAULT 'new',
  location_attached BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  author_name VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE verifications (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  kind verificationkind NOT NULL,
  voter_name VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE report_images (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  file_path VARCHAR(255) NOT NULL,
  alt_text VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE official_alerts (
  id SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'District Collector',
  severity VARCHAR(40) NOT NULL DEFAULT 'official',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_reports_district_id ON reports(district_id);
CREATE INDEX ix_reports_created_at ON reports(created_at);
CREATE INDEX ix_comments_report_id ON comments(report_id);
CREATE INDEX ix_verifications_report_id ON verifications(report_id);
CREATE INDEX ix_official_alerts_district_id ON official_alerts(district_id);

