// "Today" as YYYY-MM-DD in the server's local time zone.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ongoing = today, upcoming = future, past = before today.
function phaseOf(eventDate) {
  const t = today();
  if (eventDate === t) return 'ongoing';
  return eventDate > t ? 'upcoming' : 'past';
}

module.exports = { today, phaseOf };
