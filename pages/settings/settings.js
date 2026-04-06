const { ElderBehavior, setElderMode } = require("../../utils/elder");

Page({
  behaviors: [ElderBehavior],
  onElderModeChange(e) {
    const val = e.detail.value;
    setElderMode(val);
    this.setData({ elderMode: val });
  },
  onClearCache() {
    wx.showModal({
      title: "清除缓存",
      content: "确定清除本地缓存吗？不会影响登录状态。",
      confirmText: "清除",
      confirmColor: "#ff4d4d",
      success(res) {
        if (!res.confirm) return;
        try {
          const user = wx.getStorageSync("user");
          wx.clearStorageSync();
          if (user) wx.setStorageSync("user", user);
          wx.showToast({ title: "缓存已清除", icon: "success" });
        } catch (e) {
          wx.showToast({ title: "清除失败", icon: "none" });
        }
      }
    });
  },
  onAbout() {
    wx.showModal({
      title: "关于本应用",
      content: "非遗梯田文化小程序\n版本：0.0.2\n\n记录和传承非物质文化遗产，守护梯田文明。",
      showCancel: false,
      confirmText: "知道了"
    });
  }
});
