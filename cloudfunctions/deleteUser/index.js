const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { userId } = event;
  if (!userId) {
    return { success: false, message: "缺少参数 userId" };
  }

  const db = cloud.database();
  try {
    await db.collection("users").doc(userId).remove();
    return { success: true };
  } catch (err) {
    return { success: false, message: String((err && err.message) || err) };
  }
};
