const { isAdmin } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTION = "feiyi_culture";

const trimValue = (value) => String(value || "").trim();

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

Page({
  behaviors: [ElderBehavior],
  data: {
    loading: false,
    uploading: false,
    uploadingModel: false,
    editingId: "",
    modelFileName: "",
    form: {
      title: "",
      description: "",
      location: "",
      imageUrl: "",
      modelUrl: ""
    }
  },
  onLoad(options) {
    if (!isAdmin()) {
      showToast("仅管理员可操作");
      wx.switchTab({
        url: "/pages/feiyi/feiyi"
      });
      return;
    }
    const id = options && options.id;
    if (id) {
      this.setData({
        editingId: id
      });
      this.fetchDetail(id);
    }
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
          const modelUrl = res.data.modelUrl || "";
          const modelFileName = modelUrl
            ? (modelUrl.split("/").pop() || "模型文件.glb")
            : "";
          this.setData({
            modelFileName,
            form: {
              title: res.data.title || "",
              description: res.data.description || "",
              location: res.data.location || "",
              imageUrl: res.data.imageUrl || "",
              modelUrl
            }
          });
        }
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
  onInputTitle(e) {
    this.setData({
      "form.title": e.detail.value
    });
  },
  onInputDescription(e) {
    this.setData({
      "form.description": e.detail.value
    });
  },
  onInputLocation(e) {
    this.setData({
      "form.location": e.detail.value
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
        const cloudPath = `feiyi/${Date.now()}_${Math.random()
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
    const title = trimValue(this.data.form.title);
    const description = trimValue(this.data.form.description);
    const location = trimValue(this.data.form.location);
    const imageUrl = trimValue(this.data.form.imageUrl);

    if (!title || !description || !location || !imageUrl) {
      showToast("请完整填写标题、描述、位置和照片");
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    wx.showLoading({
      title: this.data.editingId ? "保存中..." : "新增中..."
    });

    const modelUrl = trimValue(this.data.form.modelUrl);
    const payload = {
      title,
      description,
      location,
      imageUrl,
      modelUrl,
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
          showToast("数据库权限不足，请检查 feiyi_culture 集合权限");
          return;
        }
        showToast("保存失败，请稍后再试");
      })
      .finally(() => {
        wx.hideLoading();
      });
  },
  onChooseModel() {
    if (this.data.uploadingModel) {
      return;
    }
    if (!wx.cloud) {
      showToast("云开发未初始化");
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["glb"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          showToast("未选择文件");
          return;
        }
        const cloudPath = `feiyi/models/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.glb`;
        this.setData({ uploadingModel: true });
        wx.showLoading({ title: "模型上传中..." });
        wx.cloud
          .uploadFile({ cloudPath, filePath: file.path })
          .then((uploadRes) => {
            this.setData({
              "form.modelUrl": uploadRes.fileID,
              modelFileName: file.name || cloudPath.split("/").pop()
            });
            showToast("模型上传成功");
          })
          .catch(() => {
            showToast("模型上传失败，请稍后重试");
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ uploadingModel: false });
          });
      }
    });
  },
  onRemoveModel() {
    wx.showModal({
      title: "删除模型",
      content: "确定要删除已上传的 3D 模型吗？",
      confirmColor: "#dc2626",
      success: (res) => {
        if (res.confirm) {
          this.setData({ "form.modelUrl": "", modelFileName: "" });
        }
      }
    });
  },
  onCancel() {
    wx.navigateBack();
  }
});
