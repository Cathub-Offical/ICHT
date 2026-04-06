const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { userId, payload } = event;
  if (!userId || !payload) {
    return { success: false, message: "缺少参数" };
  }

  const db = cloud.database();
  try {
    await db.collection("users").doc(userId).update({ data: payload });
    return { success: true };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
};
