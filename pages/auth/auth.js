const PASSWORD_MIN_LENGTH = 6;

const { getLandingPath, getRole } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const trimValue = (value) => String(value || "").trim();

const showToast = (title) => {
  wx.showToast({ title, icon: "none" });
};

const isPermissionDenied = (err) => {
  const message = String((err && (err.errMsg || err.message)) || "").toLowerCase();
  const code = String((err && (err.errCode || err.code)) || "").toLowerCase();
  return message.includes("permission") || message.includes("auth") || code === "401";
};

const getDb = () => {
  if (!wx.cloud) { showToast("云开发未初始化"); return null; }
  return wx.cloud.database();
};

const saveUserAndRedirect = (user) => {
  wx.setStorageSync("user", {
    _id: user._id,
    account: user.account,
    name: user.name,
    avatarUrl: user.avatarUrl || "",
    role: getRole(user)
  });
  wx.switchTab({ url: getLandingPath(user) });
};

Page({
  behaviors: [ElderBehavior],
  data: {
    step: "wx",
    wxLoading: false,
    profileSubmitting: false,
    loginSubmitting: false,
    profile: { name: "", avatarUrl: "" },
    login: { account: "", password: "" }
  },
  onShow() {
    const user = wx.getStorageSync("user");
    if (user && user.account) {
      wx.switchTab({ url: getLandingPath(user) });
    }
  },
  onShowAdmin() {
    this.setData({ step: "admin" });
  },
  onShowWx() {
    this.setData({ step: "wx" });
  },
  onWxLogin() {
    this.setData({ wxLoading: true });
    wx.cloud.callFunction({ name: "wxLogin", data: {} })
      .then((res) => {
        const result = res && res.result;
        if (!result || !result.success) {
          showToast("登录失败：" + (result && result.message || "未知错误"));
          return;
        }
        if (result.isNew) {
          this.setData({ step: "profile" });
          return;
        }
        saveUserAndRedirect(result.user);
      })
      .catch(() => showToast("微信登录失败，请稍后再试"))
      .finally(() => this.setData({ wxLoading: false }));
  },
  onChooseAvatar(e) {
    this.setData({ "profile.avatarUrl": e.detail.avatarUrl });
  },
  onNicknameInput(e) {
    this.setData({ "profile.name": e.detail.value });
  },
  onProfileSubmit() {
    const name = trimValue(this.data.profile.name);
    if (!name) {
      showToast("请设置昵称");
      return;
    }
    this.setData({ profileSubmitting: true });
    wx.showLoading({ title: "上传中..." });

    const doLogin = (avatarUrl) => {
      wx.cloud.callFunction({
        name: "wxLogin",
        data: { name, avatarUrl }
      })
        .then((res) => {
          const result = res && res.result;
          if (!result || !result.success) {
            showToast("登录失败：" + (result && result.message || "未知错误"));
            return;
          }
          saveUserAndRedirect(result.user);
        })
        .catch(() => showToast("登录失败，请稍后再试"))
        .finally(() => {
          wx.hideLoading();
          this.setData({ profileSubmitting: false });
        });
    };

    const tempPath = this.data.profile.avatarUrl;
    if (tempPath && !tempPath.startsWith("cloud://")) {
      const ext = tempPath.split(".").pop().split("?")[0] || "jpg";
      wx.cloud.uploadFile({
        cloudPath: `avatars/${Date.now()}.${ext}`,
        filePath: tempPath,
        success: (res) => doLogin(res.fileID),
        fail: () => doLogin("")
      });
    } else {
      doLogin(tempPath || "");
    }
  },
  onLoginAccountInput(e) {
    this.setData({ "login.account": e.detail.value });
  },
  onLoginPasswordInput(e) {
    this.setData({ "login.password": e.detail.value });
  },
  onLoginSubmit() {
    if (this.data.loginSubmitting) return;
    const account = trimValue(this.data.login.account);
    const password = String(this.data.login.password || "");
    if (!account || !password) {
      showToast("请输入账号和密码");
      return;
    }
    const db = getDb();
    if (!db) return;
    this.setData({ loginSubmitting: true });
    wx.showLoading({ title: "登录中..." });
    db.collection("users").where({ account }).limit(1).get()
      .then((res) => {
        if (!res.data || !res.data.length) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
        const user = res.data[0];
        if (user.password !== password) throw Object.assign(new Error("WRONG_PASSWORD"), { code: "WRONG_PASSWORD" });
        saveUserAndRedirect(user);
      })
      .catch((err) => {
        if (err && err.code === "NOT_FOUND") { showToast("账号不存在"); return; }
        if (err && err.code === "WRONG_PASSWORD") { showToast("密码错误"); return; }
        if (isPermissionDenied(err)) { showToast("数据库权限不足"); return; }
        showToast("登录失败，请稍后再试");
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ loginSubmitting: false });
      });
  }
});
