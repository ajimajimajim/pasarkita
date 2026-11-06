// Creates an error with an HTTP status code, e.g. throw httpError(404, 'Lot not found.')
module.exports = function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
};
