-- =====================================================================
-- PasarKita database schema
-- Run through `npm run setup` (this DROPS and recreates every table).
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS helper_requests;
DROP TABLE IF EXISTS relocation_requests;
DROP TABLE IF EXISTS stall_applications;
DROP TABLE IF EXISTS facilities;
DROP TABLE IF EXISTS lots;
DROP TABLE IF EXISTS helpers;
DROP TABLE IF EXISTS market_events;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS organizers;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- Login accounts. Public visitors need no account.
CREATE TABLE users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  role           ENUM('organizer', 'vendor') NOT NULL,
  username       VARCHAR(50) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Organizer profile (one per organizer account).
CREATE TABLE organizers (
  organizer_id  INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(30),
  email         VARCHAR(120),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vendor profile (one per vendor account).
CREATE TABLE vendors (
  vendor_id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id              INT NOT NULL UNIQUE,
  name                 VARCHAR(120) NOT NULL,
  contact_number       VARCHAR(30) NOT NULL,
  email                VARCHAR(120),
  goods_type           VARCHAR(100),
  stall_size_required  VARCHAR(50),
  registered_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Market events. Ongoing / upcoming / past is worked out from event_date.
CREATE TABLE market_events (
  event_id       INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  event_date     DATE NOT NULL,
  location       VARCHAR(200) NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  status         ENUM('scheduled', 'cancelled') NOT NULL DEFAULT 'scheduled',
  map_image_url  VARCHAR(255) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stall lots drawn on an event's map. Position and size are percentages
-- of the map (0-100) so the map scales to any screen.
CREATE TABLE lots (
  lot_id      INT AUTO_INCREMENT PRIMARY KEY,
  event_id    INT NOT NULL,
  lot_number  VARCHAR(20) NOT NULL,
  size_label  VARCHAR(50),
  zone        VARCHAR(60),
  price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  pos_x       DECIMAL(6,2) NOT NULL,
  pos_y       DECIMAL(6,2) NOT NULL,
  width       DECIMAL(6,2) NOT NULL,
  height      DECIMAL(6,2) NOT NULL,
  vendor_id   INT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE SET NULL,
  UNIQUE KEY uq_event_lot (event_id, lot_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Facilities on the map (parking, toilet, surau, ...).
CREATE TABLE facilities (
  facility_id  INT AUTO_INCREMENT PRIMARY KEY,
  event_id     INT NOT NULL,
  type         VARCHAR(30) NOT NULL,
  label        VARCHAR(60),
  pos_x        DECIMAL(6,2) NOT NULL,
  pos_y        DECIMAL(6,2) NOT NULL,
  width        DECIMAL(6,2) NOT NULL,
  height       DECIMAL(6,2) NOT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A vendor's application for a lot. Also holds the vendor's attendance
-- confirmation and arrival time for that event (Next Event page).
CREATE TABLE stall_applications (
  application_id     INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id          INT NOT NULL,
  event_id           INT NOT NULL,
  lot_id             INT NULL,
  goods_description  VARCHAR(255),
  notes              VARCHAR(500),
  status             ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  organizer_note     VARCHAR(255),
  attendance         ENUM('unconfirmed', 'attending', 'not_attending') NOT NULL DEFAULT 'unconfirmed',
  arrival_time       TIME NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at         TIMESTAMP NULL,
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(lot_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A vendor's request to move from their accepted lot to another free lot.
CREATE TABLE relocation_requests (
  relocation_id   INT AUTO_INCREMENT PRIMARY KEY,
  application_id  INT NOT NULL,
  vendor_id       INT NOT NULL,
  from_lot_id     INT NULL,
  to_lot_id       INT NULL,
  reason          VARCHAR(500),
  status          ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  organizer_note  VARCHAR(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at      TIMESTAMP NULL,
  FOREIGN KEY (application_id) REFERENCES stall_applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
  FOREIGN KEY (from_lot_id) REFERENCES lots(lot_id) ON DELETE SET NULL,
  FOREIGN KEY (to_lot_id) REFERENCES lots(lot_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Porters / trolley helpers managed by the organizer.
CREATE TABLE helpers (
  helper_id       INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  contact_number  VARCHAR(30),
  service_type    ENUM('porter', 'trolley') NOT NULL,
  status          ENUM('available', 'off_duty') NOT NULL DEFAULT 'available'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A vendor's request for load-moving help at an event.
CREATE TABLE helper_requests (
  request_id      INT AUTO_INCREMENT PRIMARY KEY,
  application_id  INT NOT NULL,
  vendor_id       INT NOT NULL,
  event_id        INT NOT NULL,
  service_type    ENUM('porter', 'trolley') NOT NULL,
  requested_time  TIME NOT NULL,
  notes           VARCHAR(500),
  status          ENUM('pending', 'assigned', 'rejected', 'completed') NOT NULL DEFAULT 'pending',
  helper_id       INT NULL,
  organizer_note  VARCHAR(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES stall_applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (helper_id) REFERENCES helpers(helper_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stall fee payment with an uploaded receipt, verified by the organizer.
CREATE TABLE payments (
  payment_id        INT AUTO_INCREMENT PRIMARY KEY,
  application_id    INT NOT NULL,
  vendor_id         INT NOT NULL,
  event_id          INT NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  receipt_file_url  VARCHAR(255) NOT NULL,
  status            ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  review_note       VARCHAR(255),
  reviewed_by       INT NULL,
  reviewed_at       TIMESTAMP NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES stall_applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
