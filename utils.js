function renderLocalDate(date) {
  const options = {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "long",
    year: "numeric",
  };

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

module.exports = {
  renderLocalDate,
};
