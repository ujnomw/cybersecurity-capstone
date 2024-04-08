const users = [
  {
    id: 0,
    username: "admin",
    password: "password",
    email: "admin@mail.com",
  },
  {
    id: 1,
    username: "moderator",
    password: "password2",
    email: "moderator@mail.com",
  },
];

const messages = [
  {
    id: "0",
    from: "admin",
    to: "admin",
    textContent: "Welcome to secure messaging system",
    timestamp: Date.now(),
  },
];

const isUser = (username, password) => {
  return users.some(
    (user) => user.username === username && user.password === password
  );
};

const getUsersMessages = (userName) => {
  // TODO: replace
  return messages.filter((m) => m.to === userName);
};

const getUsersMessageById = (userName, messageId) => {
  return messages.find((m) => m.id === messageId && m.to === userName);
};

const sendMessage = async (to, from, content) => {
  const message = {
    id: messages.length.toString(),
    to,
    from,
    textContent: content,
    timestamp: Date.now(),
  };
  messages.push(message);
};

const register = async (username, password, email) => {
  const user = {
    id: users.length,
    username,
    password,
    email,
  };
  users.push(user);
};

module.exports = {
  getUsersMessages,
  getMessageById: getUsersMessageById,
  isUser,
  sendMessage,
  register,
};
