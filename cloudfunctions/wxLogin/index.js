const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, message: "无法获取微信身份" };
  }

  const { name, avatarUrl } = event;
  const db = cloud.database();

  try {
    const res = await db.collection("users").where({ openid: OPENID }).limit(1).get();

    if (res.data && res.data.length > 0) {
      const user = res.data[0];
      if (user.status === "disabled") {
        return { success: false, message: "账号已被禁用，请联系管理员" };
      }
      await db.collection("users").doc(user._id).update({
        data: { lastLoginAt: db.serverDate() }
      });
      return { success: true, user, isNew: false };
    }

    if (!name) {
      return { success: true, isNew: true };
    }

    const newUser = {
      openid: OPENID,
      account: `wx_${OPENID.slice(-8)}`,
      name,
      avatarUrl: avatarUrl || "",
      role: "user",
      status: "active",
      createdAt: db.serverDate(),
      lastLoginAt: db.serverDate()
    };
    const addRes = await db.collection("users").add({ data: newUser });
    return { success: true, user: { ...newUser, _id: addRes._id }, isNew: false };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
};
