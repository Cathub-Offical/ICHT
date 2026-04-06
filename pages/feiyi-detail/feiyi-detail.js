const { isAdmin } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTION = "feiyi_culture";

const trimValue = (value) => String(value || "").trim();
const padTwo = (value) => String(value).padStart(2, "0");

const showToast = (title) => {
  wx.showToast({
    title,
    icon: "none"
  });
};

const isPermissionDenied = (err) => {
  const message = String((err && (err.errMsg || err.message)) || "").toLowerCase();
  const code = String((err && (err.errCode || err.code)) || "").toLowerCase();
  return message.includes("permission") || message.includes("auth") || code === "401";
};

const getDb = () => {
  if (!wx.cloud) {
    showToast("云开发未初始化");
    return null;
  }
  return wx.cloud.database();
};

const formatDateTime = (value) => {
  if (!value) {
    return "--";
  }
  let date = value;
  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value && typeof value === "object" && value.$date) {
    date = new Date(value.$date);
  } else if (!(value instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "--";
  }

  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())} ${padTwo(
    date.getHours()
  )}:${padTwo(date.getMinutes())}`;
};

Page({
  behaviors: [ElderBehavior],
  data: {
    loading: false,
    itemId: "",
    item: null,
    createdAtText: "--",
    modelLoading: false,
    modelError: "",
    modelWidth: 300,
    modelHeight: 300,
    modelRenderWidth: 300,
    modelRenderHeight: 300
  },
  onLoad(options) {
    const info = wx.getSystemInfoSync();
    const w = info.windowWidth;
    const paddingPx = Math.round(120 * w / 750);
    const canvasW = w - paddingPx;
    const canvasH = Math.round(canvasW * 0.65);
    this.setData({
      modelWidth: canvasW,
      modelHeight: canvasH,
      modelRenderWidth: canvasW,
      modelRenderHeight: canvasH
    });
    const itemId = trimValue(options && options.id);
    if (!itemId) {
      showToast("缺少内容信息");
      wx.navigateBack();
      return;
    }

    this.setData({
      itemId
    });
    this.fetchDetail();
  },
  fetchDetail() {
    const db = getDb();
    if (!db) {
      return;
    }

    this.setData({
      loading: true
    });

    db.collection(COLLECTION)
      .doc(this.data.itemId)
      .get()
      .then((res) => {
        const item = (res && res.data) || null;
        this.setData({
          item,
          createdAtText: formatDateTime(item && (item.createdAt || item.updatedAt))
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 feiyi_culture 集合权限");
          return;
        }
        showToast("加载失败，请稍后再试");
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  },
  onXrReady() {
    this.setData({ modelError: "" });
  },
  onModelLoaded() {
    this.setData({ modelLoading: false, modelError: "" });
  },
  onXrError(e) {
    const msg = (e && e.detail && e.detail.message) || "3D 模型加载失败";
    this.setData({ modelLoading: false, modelError: msg });
  }
});
