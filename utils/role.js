const ADMIN_ACCOUNT = "admin";

const getStoredUser = () => {
  try {
    return wx.getStorageSync("user") || null;
  } catch (err) {
    return null;
  }
};

const isAdmin = (user) => {
  const target = user || getStoredUser();
  return Boolean(target && target.account === ADMIN_ACCOUNT);
};

const getRole = (user) => (isAdmin(user) ? "admin" : "user");

const getLandingPath = (user) =>
  isAdmin(user) ? "/pages/home/home" : "/pages/feiyi/feiyi";

module.exports = {
  ADMIN_ACCOUNT,
  getStoredUser,
  isAdmin,
  getRole,
  getLandingPath
};
