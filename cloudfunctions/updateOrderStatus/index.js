const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { orderId, status } = event;
  if (!orderId || !status) {
    return { success: false, message: "缺少参数" };
  }

  const db = cloud.database();
  try {
    await db.collection("orders").doc(orderId).update({
      data: {
        status,
        updatedAt: db.serverDate()
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: String(err && err.message || err) };
  }
};
