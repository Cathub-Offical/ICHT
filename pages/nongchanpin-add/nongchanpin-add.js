const { isAdmin } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTION = "nongchanpin_products";

const trimValue = (value) => String(value || "").trim();
const padTwo = (value) => String(value).padStart(2, "0");
const SECOND_OPTIONS = Array.from({ length: 60 }, (_, index) => padTwo(index));

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

const getCurrentHarvestParts = () => {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`,
    time: `${padTwo(now.getHours())}:${padTwo(now.getMinutes())}`,
    second: padTwo(now.getSeconds())
  };
};

const generateTraceInfo = () => {
  const timestamp = Date.now();
  const randomPart = Math.floor(Math.random() * 900000 + 100000);
  return `NC${timestamp}${randomPart}`;
};

const splitHarvestDateTime = (value) => {
  const normalized = trimValue(value).replace("T", " ");
  const fullMatch = normalized.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (fullMatch) {
    return {
      date: fullMatch[1],
      time: `${fullMatch[2]}:${fullMatch[3]}`,
      second: fullMatch[4] || ""
    };
  }

  const dateMatch = normalized.match(/\d{4}-\d{2}-\d{2}/);
  const timeMatch = normalized.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);

  return {
    date: dateMatch ? dateMatch[0] : "",
    time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "",
    second: timeMatch && timeMatch[3] ? timeMatch[3] : ""
  };
};

const buildHarvestDateTime = (dateValue, timeValue, secondValue) => {
  const date = trimValue(dateValue);
  const time = trimValue(timeValue);
  const second = trimValue(secondValue);

  if (!date && !time) {
    return "";
  }
  if (date && time) {
    return second ? `${date} ${time}:${second}` : `${date} ${time}`;
  }
  if (date) {
    return date;
  }
  return second ? `${time}:${second}` : time;
};

Page({
  behaviors: [ElderBehavior],
  data: {
    loading: false,
    uploading: false,
    editingId: "",
    harvestDate: "",
    harvestClock: "",
    harvestSecond: SECOND_OPTIONS[0],
    harvestSecondIndex: 0,
    secondOptions: SECOND_OPTIONS,
    form: {
      name: "",
      description: "",
      origin: "",
      price: "",
      nutrition: "",
      harvestTime: "",
      traceInfo: "",
      imageUrl: ""
    }
  },
  onLoad(options) {
    if (!isAdmin()) {
      showToast("仅管理员可操作");
      wx.switchTab({
        url: "/pages/nongchanpin/nongchanpin"
      });
      return;
    }

    const id = options && options.id;
    if (id) {
      this.setData({
        editingId: id
      });
      this.fetchDetail(id);
      return;
    }

    const currentHarvest = getCurrentHarvestParts();
    this.updateHarvestTime(currentHarvest.date, currentHarvest.time, currentHarvest.second);
    this.setData({
      "form.traceInfo": generateTraceInfo()
    });
  },
  fetchDetail(id) {
    const db = getDb();
    if (!db) {
      return;
    }
    this.setData({
      loading: true
    });
    db.collection(COLLECTION)
      .doc(id)
      .get()
      .then((res) => {
        if (res && res.data) {
          const harvestParts = splitHarvestDateTime(res.data.harvestTime || "");
          const currentHarvest = getCurrentHarvestParts();
          const harvestDate = harvestParts.date || currentHarvest.date;
          const harvestClock = harvestParts.time || currentHarvest.time;
          const harvestSecond = SECOND_OPTIONS.includes(harvestParts.second) ? harvestParts.second : "00";

          this.setData({
            harvestDate,
            harvestClock,
            harvestSecond,
            harvestSecondIndex: SECOND_OPTIONS.indexOf(harvestSecond),
            form: {
              name: res.data.name || "",
              description: res.data.description || "",
              origin: res.data.origin || "",
              price: res.data.price || "",
              nutrition: res.data.nutrition || "",
              harvestTime: buildHarvestDateTime(harvestDate, harvestClock, harvestSecond),
              traceInfo: res.data.traceInfo || generateTraceInfo(),
              imageUrl: res.data.imageUrl || ""
            }
          });
        }
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 nongchanpin_products 集合权限");
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
  onInputName(e) {
    this.setData({
      "form.name": e.detail.value
    });
  },
  onInputDescription(e) {
    this.setData({
      "form.description": e.detail.value
    });
  },
  onInputOrigin(e) {
    this.setData({
      "form.origin": e.detail.value
    });
  },
  onInputPrice(e) {
    this.setData({
      "form.price": e.detail.value
    });
  },
  onInputNutrition(e) {
    this.setData({
      "form.nutrition": e.detail.value
    });
  },
  updateHarvestTime(dateValue, timeValue, secondValue) {
    const harvestDate = trimValue(dateValue);
    const harvestClock = trimValue(timeValue);
    const secondIndex = SECOND_OPTIONS.indexOf(trimValue(secondValue));
    const harvestSecond = secondIndex > -1 ? SECOND_OPTIONS[secondIndex] : SECOND_OPTIONS[0];

    this.setData({
      harvestDate,
      harvestClock,
      harvestSecond,
      harvestSecondIndex: SECOND_OPTIONS.indexOf(harvestSecond),
      "form.harvestTime": buildHarvestDateTime(harvestDate, harvestClock, harvestSecond)
    });
  },
  onHarvestDateChange(e) {
    this.updateHarvestTime(e.detail.value, this.data.harvestClock, this.data.harvestSecond);
  },
  onHarvestClockChange(e) {
    this.updateHarvestTime(this.data.harvestDate, e.detail.value, this.data.harvestSecond);
  },
  onHarvestSecondChange(e) {
    const secondIndex = Number(e.detail.value);
    const harvestSecond = this.data.secondOptions[secondIndex] || SECOND_OPTIONS[0];
    this.updateHarvestTime(this.data.harvestDate, this.data.harvestClock, harvestSecond);
  },
  onRegenerateTraceInfo() {
    if (this.data.editingId) {
      return;
    }
    this.setData({
      "form.traceInfo": generateTraceInfo()
    });
  },
  onInputImage(e) {
    this.setData({
      "form.imageUrl": e.detail.value
    });
  },
  onChooseImage() {
    if (this.data.uploading) {
      return;
    }
    if (!wx.cloud) {
      showToast("云开发未初始化");
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const filePath = res.tempFilePaths && res.tempFilePaths[0];
        if (!filePath) {
          showToast("未选择图片");
          return;
        }
        const extMatch = filePath.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0] : ".png";
        const cloudPath = `products/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}${ext}`;
        this.setData({
          uploading: true
        });
        wx.showLoading({
          title: "上传中..."
        });
        wx.cloud
          .uploadFile({
            cloudPath,
            filePath
          })
          .then((uploadRes) => {
            this.setData({
              "form.imageUrl": uploadRes.fileID
            });
            showToast("上传成功");
          })
          .catch(() => {
            showToast("上传失败，请稍后重试");
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({
              uploading: false
            });
          });
      }
    });
  },
  onSubmit() {
    const name = trimValue(this.data.form.name);
    const description = trimValue(this.data.form.description);
    const origin = trimValue(this.data.form.origin);
    const price = trimValue(this.data.form.price);
    const nutrition = trimValue(this.data.form.nutrition);
    const harvestDate = trimValue(this.data.harvestDate);
    const harvestClock = trimValue(this.data.harvestClock);
    const harvestSecond = trimValue(this.data.harvestSecond);
    const harvestTime = buildHarvestDateTime(harvestDate, harvestClock, harvestSecond);
    const traceInfo = trimValue(this.data.form.traceInfo) || generateTraceInfo();
    const imageUrl = trimValue(this.data.form.imageUrl);

    if (!harvestDate || !harvestClock || !harvestSecond) {
      showToast("请完整选择采摘日期、时间和秒");
      return;
    }

    if (
      !name ||
      !description ||
      !origin ||
      !price ||
      !nutrition ||
      !harvestTime ||
      !traceInfo ||
      !imageUrl
    ) {
      showToast("请完整填写所有农产品信息");
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    wx.showLoading({
      title: this.data.editingId ? "保存中..." : "新增中..."
    });

    const payload = {
      name,
      description,
      origin,
      price,
      nutrition,
      harvestTime,
      traceInfo,
      imageUrl,
      updatedAt: db.serverDate()
    };

    const action = this.data.editingId
      ? db.collection(COLLECTION).doc(this.data.editingId).update({ data: payload })
      : db.collection(COLLECTION).add({
          data: {
            ...payload,
            createdAt: db.serverDate()
          }
        });

    action
      .then(() => {
        showToast(this.data.editingId ? "保存成功" : "新增成功");
        setTimeout(() => {
          wx.navigateBack();
        }, 500);
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 nongchanpin_products 集合权限");
          return;
        }
        showToast("保存失败，请稍后再试");
      })
      .finally(() => {
        wx.hideLoading();
      });
  },
  onCancel() {
    wx.navigateBack();
  }
});
